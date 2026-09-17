import { NextResponse } from "next/server";
import { supabaseAdmin, traduzirErroPostgres } from "@/lib/supabase/admin";
import { bearer, erro, ok, registrar, segredoConfere } from "@/lib/api";
import { envServidor } from "@/lib/env";
import { esquemaStatusPedido } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Consulta e atualizacao de status dos pedidos ONLINE.
 *
 * Nao substitui o painel de comandas: e apenas a visao dos pedidos do site,
 * para acompanhar pagamento e despacho. A operacao da cozinha continua no
 * sistema interno ja existente.
 */
function autorizado(req: Request): boolean {
  return segredoConfere(bearer(req), envServidor.adminToken);
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!autorizado(req)) return erro("NAO_AUTORIZADO", "Token inválido.", 401);

  const limite = Number(new URL(req.url).searchParams.get("limite") ?? "40");
  const { data, error } = await supabaseAdmin().rpc("loja_listar_pedidos", {
    p_limite: Number.isFinite(limite) ? limite : 40,
  });

  if (error) return erro("ERRO_INTERNO", "Falha ao listar pedidos.", 500);
  return ok({ pedidos: data ?? [] });
}

export async function PATCH(req: Request): Promise<NextResponse> {
  if (!autorizado(req)) return erro("NAO_AUTORIZADO", "Token inválido.", 401);

  const analise = esquemaStatusPedido.safeParse(await req.json().catch(() => null));
  if (!analise.success) return erro("DADOS_INVALIDOS", "Requisição inválida.", 400);

  const { data, error } = await supabaseAdmin().rpc("loja_atualizar_status_pedido", {
    p_numero: analise.data.numero,
    p_status: analise.data.status,
  });

  if (error) {
    const { codigo, mensagem } = traduzirErroPostgres(error.message);
    return erro(codigo, mensagem, codigo === "ERRO_INTERNO" ? 500 : 409);
  }

  registrar("status_pedido_alterado", { numero: analise.data.numero, para: analise.data.status });
  return ok(data);
}
