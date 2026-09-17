import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { provedorPagamento } from "@/lib/pagamentos";
import { erro, ipDaRequisicao, limitarTaxa, ok, registrar } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  numero: z.string().trim().min(4).max(40),
  token: z.string().trim().min(16).max(128),
});

/**
 * Reconciliacao ativa: a tela de pagamento chama isto periodicamente.
 *
 * Serve como rede de seguranca caso um webhook se perca. A fonte da verdade
 * continua sendo o provedor: consultamos a API dele, nunca o cliente.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ip = ipDaRequisicao(req);
  if (!limitarTaxa(`consulta:${ip}`, 60, 60_000)) {
    return erro("MUITAS_TENTATIVAS", "Aguarde alguns instantes.", 429);
  }

  const analise = esquema.safeParse(await req.json().catch(() => null));
  if (!analise.success) return erro("DADOS_INVALIDOS", "Requisição inválida.", 400);

  const db = supabaseAdmin();
  const { data: pedido } = await db.rpc("loja_consultar_pedido", {
    p_numero: analise.data.numero,
    p_token: analise.data.token,
  });
  if (!pedido) return erro("NAO_ENCONTRADO", "Pedido não encontrado.", 404);

  const p = pedido as {
    numero_publico: string;
    status_pagamento: string;
    status_pedido: string;
  };

  // ja resolvido: nada a reconciliar
  if (p.status_pagamento !== "pendente") {
    return ok({
      status_pagamento: p.status_pagamento,
      status_pedido: p.status_pedido,
      consultado_no_provedor: false,
    });
  }

  let provedor;
  try {
    provedor = provedorPagamento();
  } catch {
    return ok({
      status_pagamento: p.status_pagamento,
      status_pedido: p.status_pedido,
      consultado_no_provedor: false,
    });
  }

  // o driver dev nao tem o que consultar: devolve o estado atual sem inventar
  if (!provedor.confirmaAutomaticamente) {
    return ok({
      status_pagamento: p.status_pagamento,
      status_pedido: p.status_pedido,
      consultado_no_provedor: false,
    });
  }

  const { data: pedidoId } = await db.rpc("loja_id_do_pedido", {
    p_numero: p.numero_publico,
  });
  const { data: cobrancaId } = await db.rpc("loja_cobranca_do_pedido", {
    p_pedido_id: pedidoId as string,
  });
  if (!cobrancaId) {
    return ok({
      status_pagamento: p.status_pagamento,
      status_pedido: p.status_pedido,
      consultado_no_provedor: false,
    });
  }

  try {
    const consulta = await provedor.consultarCobranca(cobrancaId as string);
    if (consulta.status === "pago") {
      await db.rpc("loja_confirmar_pagamento", {
        p_pedido_id: pedidoId as string,
        p_provedor: provedor.nome,
        p_cobranca_id: cobrancaId as string,
        p_payload: (consulta.bruto ?? null) as never,
      });
      registrar("pagamento_confirmado_por_consulta", { numero: p.numero_publico });
    } else if (consulta.status !== "pendente") {
      await db.rpc("loja_atualizar_status_pagamento", {
        p_pedido_id: pedidoId as string,
        p_status: consulta.status,
        p_payload: (consulta.bruto ?? null) as never,
      });
    }
    return ok({
      status_pagamento: consulta.status,
      status_pedido: p.status_pedido,
      consultado_no_provedor: true,
    });
  } catch (e) {
    registrar("consulta_pagamento_falhou", { motivo: (e as Error).message });
    return ok({
      status_pagamento: p.status_pagamento,
      status_pedido: p.status_pedido,
      consultado_no_provedor: false,
    });
  }
}
