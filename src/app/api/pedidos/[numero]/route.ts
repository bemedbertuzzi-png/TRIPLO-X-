import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { erro, ok } from "@/lib/api";
import { esquemaConsultaPedido } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Acompanhamento do pedido: exige numero + token opaco emitido na criacao. */
export async function GET(
  req: Request,
  contexto: { params: Promise<{ numero: string }> },
): Promise<NextResponse> {
  const { numero } = await contexto.params;
  const token = new URL(req.url).searchParams.get("token") ?? "";

  const analise = esquemaConsultaPedido.safeParse({ numero, token });
  if (!analise.success) {
    return erro("DADOS_INVALIDOS", "Pedido ou código de acompanhamento inválido.", 400);
  }

  const { data, error } = await supabaseAdmin().rpc("loja_consultar_pedido", {
    p_numero: analise.data.numero,
    p_token: analise.data.token,
  });

  if (error) {
    return erro("ERRO_INTERNO", "Não foi possível consultar o pedido.", 500);
  }
  if (!data) {
    // mesma resposta para "nao existe" e "token errado": nao revela nada
    return erro("NAO_ENCONTRADO", "Pedido não encontrado.", 404);
  }

  return ok(data);
}
