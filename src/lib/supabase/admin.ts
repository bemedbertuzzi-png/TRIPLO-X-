import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { envServidor } from "@/lib/env";

/**
 * Cliente com service role. Ignora RLS, portanto NUNCA pode ser importado
 * por um componente de cliente. O import de "server-only" garante isso em build.
 *
 * Todo acesso a dados de pedido passa pelas funcoes RPC `loja_*` do schema
 * `public`, que sao SECURITY DEFINER e concedidas apenas ao service_role.
 */
let cache: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!cache) {
    cache = createClient(envServidor.supabaseUrl, envServidor.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return cache;
}

/** Erros de regra de negocio vem do Postgres como "CODIGO: mensagem". */
export function traduzirErroPostgres(mensagem: string): {
  codigo: string;
  mensagem: string;
} {
  const m = /^([A-Z_]+):\s*(.+)$/.exec(mensagem.trim());
  if (m && m[1] && m[2]) return { codigo: m[1], mensagem: m[2] };
  return { codigo: "ERRO_INTERNO", mensagem: "Não foi possível concluir a operação." };
}
