import { NextResponse } from "next/server";
import { supabasePublico } from "@/lib/supabase/publico";
import { erro, ok } from "@/lib/api";

export const runtime = "nodejs";
export const revalidate = 30;

/** Catalogo publico. Usa a chave anonima: so enxerga itens ativos. */
export async function GET(): Promise<NextResponse> {
  const { data, error } = await supabasePublico().rpc("loja_catalogo");
  if (error) return erro("ERRO_INTERNO", "Falha ao carregar o cardápio.", 500);
  return ok(data);
}
