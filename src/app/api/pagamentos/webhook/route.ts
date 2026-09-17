import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { provedorPagamento } from "@/lib/pagamentos";
import { erro, ok, registrar } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook do provedor Pix.
 *
 * Camadas de protecao, nesta ordem:
 *  1. assinatura conferida pelo driver (requisicao nao assinada e descartada);
 *  2. status relido da API do provedor — o corpo do webhook nunca e a verdade;
 *  3. idempotencia por evento em `loja.webhook_eventos`;
 *  4. confirmacao em si e idempotente no banco.
 *
 * Sempre respondemos 200 para eventos ja processados, para que o provedor
 * pare de reenviar.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const corpoBruto = await req.text();

  let provedor;
  try {
    provedor = provedorPagamento();
  } catch (e) {
    registrar("webhook_provedor_indisponivel", { motivo: (e as Error).message });
    return erro("INDISPONIVEL", "Provedor de pagamento não configurado.", 503);
  }

  let evento;
  try {
    evento = await provedor.interpretarWebhook(corpoBruto, req.headers);
  } catch (e) {
    registrar("webhook_falha_interpretacao", { motivo: (e as Error).message });
    return erro("ERRO_INTERNO", "Falha ao processar o evento.", 500);
  }

  if (!evento) {
    registrar("webhook_rejeitado", { provedor: provedor.nome });
    return erro("ASSINATURA_INVALIDA", "Evento não autenticado.", 401);
  }

  const db = supabaseAdmin();

  const { data: ehNovo, error: erroRegistro } = await db.rpc("loja_registrar_webhook", {
    p_provedor: provedor.nome,
    p_evento_id: evento.eventoId,
    p_payload: (evento.bruto ?? null) as never,
  });

  if (erroRegistro) {
    return erro("ERRO_INTERNO", "Falha ao registrar o evento.", 500);
  }
  if (!ehNovo) {
    registrar("webhook_duplicado", { provedor: provedor.nome });
    return ok({ processado: false, motivo: "evento_duplicado" });
  }

  const { data: pedidoId, error: erroBusca } = await db.rpc("loja_pedido_por_cobranca", {
    p_provedor: provedor.nome,
    p_cobranca_id: evento.cobrancaId,
  });

  if (erroBusca) return erro("ERRO_INTERNO", "Falha ao localizar o pedido.", 500);
  if (!pedidoId) {
    // cobranca desconhecida: aceitamos o evento para nao gerar reenvio infinito
    registrar("webhook_cobranca_desconhecida", { provedor: provedor.nome });
    return ok({ processado: false, motivo: "cobranca_desconhecida" });
  }

  if (evento.status === "pago") {
    const { error } = await db.rpc("loja_confirmar_pagamento", {
      p_pedido_id: pedidoId as string,
      p_provedor: provedor.nome,
      p_cobranca_id: evento.cobrancaId,
      p_payload: (evento.bruto ?? null) as never,
    });
    if (error) return erro("ERRO_INTERNO", "Falha ao confirmar pagamento.", 500);
    registrar("pagamento_confirmado", { provedor: provedor.nome });
  } else {
    const { error } = await db.rpc("loja_atualizar_status_pagamento", {
      p_pedido_id: pedidoId as string,
      p_status: evento.status,
      p_payload: (evento.bruto ?? null) as never,
    });
    if (error) return erro("ERRO_INTERNO", "Falha ao atualizar pagamento.", 500);
    registrar("pagamento_atualizado", { provedor: provedor.nome, status: evento.status });
  }

  return ok({ processado: true });
}
