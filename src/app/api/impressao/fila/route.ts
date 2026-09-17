import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { bearer, erro, ok, registrar, segredoConfere } from "@/lib/api";
import { envServidor } from "@/lib/env";
import { esquemaConfirmarImpressao } from "@/lib/validacao";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Fila de impressao consumida pelo agente local do restaurante.
 *
 * O agente roda no computador da loja (onde a Jetway JP-800 esta ligada) e
 * faz polling aqui. A Vercel nao alcanca a impressora: quem alcanca e o
 * agente, de dentro da rede do estabelecimento. Ver docs/IMPRESSAO.md.
 *
 * Autenticacao por bearer token (IMPRESSAO_TOKEN), comparado em tempo
 * constante. GET reivindica ate N itens e ja os marca como "processando",
 * para que duas instancias do agente nao imprimam o mesmo pedido.
 */
function autorizado(req: Request): boolean {
  return segredoConfere(bearer(req), envServidor.impressaoToken);
}

export async function GET(req: Request): Promise<NextResponse> {
  if (!autorizado(req)) return erro("NAO_AUTORIZADO", "Token inválido.", 401);

  const limite = Number(new URL(req.url).searchParams.get("limite") ?? "5");
  const { data, error } = await supabaseAdmin().rpc("loja_fila_impressao", {
    p_limite: Number.isFinite(limite) ? limite : 5,
  });

  if (error) return erro("ERRO_INTERNO", "Falha ao ler a fila.", 500);

  const itens = (data ?? []) as unknown[];
  if (itens.length > 0) registrar("impressao_reivindicada", { quantidade: itens.length });

  return ok({ itens });
}

export async function POST(req: Request): Promise<NextResponse> {
  if (!autorizado(req)) return erro("NAO_AUTORIZADO", "Token inválido.", 401);

  const analise = esquemaConfirmarImpressao.safeParse(await req.json().catch(() => null));
  if (!analise.success) return erro("DADOS_INVALIDOS", "Requisição inválida.", 400);

  const { error } = await supabaseAdmin().rpc("loja_confirmar_impressao", {
    p_id: analise.data.id,
    p_ok: analise.data.ok,
    p_erro: analise.data.erro ?? null,
  });

  if (error) return erro("ERRO_INTERNO", "Falha ao confirmar impressão.", 500);

  registrar("impressao_confirmada", { ok: analise.data.ok });
  return ok({ registrado: true });
}
