import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bearer, erro, ok, registrar, segredoConfere } from "@/lib/api";
import { envServidor } from "@/lib/env";
import { provedorPagamento } from "@/lib/pagamentos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  numero: z.string().trim().min(4).max(40),
  /** quem no estabelecimento conferiu o recebimento — fica no log de auditoria */
  conferido_por: z.string().trim().min(2).max(60),
});

/**
 * Confirmacao MANUAL de pagamento.
 *
 * Existe porque, sem um PSP integrado, ninguem pode dizer que um Pix caiu
 * exceto uma pessoa olhando o extrato. Nunca e acionada pelo cliente: exige
 * ADMIN_TOKEN e o nome de quem conferiu, e o registro guarda que foi manual.
 *
 * Isto NAO e um pagamento simulado: e uma conferencia humana registrada.
 */
export async function POST(req: Request): Promise<NextResponse> {
  if (!segredoConfere(bearer(req), envServidor.adminToken)) {
    return erro("NAO_AUTORIZADO", "Token inválido.", 401);
  }

  const analise = esquema.safeParse(await req.json().catch(() => null));
  if (!analise.success) return erro("DADOS_INVALIDOS", "Requisição inválida.", 400);

  const db = supabaseAdmin();
  const { data: pedidoId } = await db.rpc("loja_id_do_pedido", {
    p_numero: analise.data.numero,
  });
  if (!pedidoId) return erro("NAO_ENCONTRADO", "Pedido não encontrado.", 404);

  const nomeProvedor = (() => {
    try {
      return provedorPagamento().nome;
    } catch {
      return envServidor.pagamentoProvider;
    }
  })();

  const { data, error } = await db.rpc("loja_confirmar_pagamento", {
    p_pedido_id: pedidoId as string,
    p_provedor: nomeProvedor,
    p_cobranca_id: null,
    p_payload: {
      confirmacao_manual: true,
      conferido_por: analise.data.conferido_por,
      em: new Date().toISOString(),
    } as never,
  });

  if (error) return erro("ERRO_INTERNO", "Falha ao confirmar pagamento.", 500);

  registrar("pagamento_confirmado_manualmente", {
    numero: analise.data.numero,
    conferido_por: analise.data.conferido_por,
  });

  return ok(data);
}
