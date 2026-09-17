-- search_path fixo: evita que um search_path de sessao mude o significado
-- das funcoes (recomendacao do linter do Supabase).
alter function loja.agora_local() set search_path = loja, public, pg_temp;
alter function loja.gerar_numero_publico() set search_path = loja, public, pg_temp;
alter function loja.touch_atualizado_em() set search_path = loja, public, pg_temp;
alter function loja.montar_cupom(uuid) set search_path = loja, public, pg_temp;

-- a consulta de pedido e feita pelo backend com service role; nenhum papel
-- do PostgREST (anon/authenticated) precisa poder chama-la diretamente
revoke all on function public.loja_consultar_pedido(text, text) from authenticated;
