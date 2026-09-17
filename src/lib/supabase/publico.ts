import { createClient } from "@supabase/supabase-js";
import { envPublico } from "@/lib/env";

/** Cliente anonimo: so enxerga o catalogo, nunca pedidos. */
export function supabasePublico() {
  return createClient(envPublico.supabaseUrl, envPublico.supabaseAnonKey, {
    auth: { persistSession: false },
  });
}
