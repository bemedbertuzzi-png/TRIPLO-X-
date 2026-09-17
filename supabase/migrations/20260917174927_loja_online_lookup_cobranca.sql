create or replace function public.loja_cobranca_do_pedido(p_pedido_id uuid) returns text
language sql stable security definer set search_path = loja, public as $$
  select cobranca_id from loja.pagamentos
   where pedido_id = p_pedido_id and cobranca_id is not null
   order by criado_em desc limit 1;
$$;

revoke all on function public.loja_cobranca_do_pedido(uuid) from public;
revoke all on function public.loja_cobranca_do_pedido(uuid) from anon;
revoke all on function public.loja_cobranca_do_pedido(uuid) from authenticated;
grant execute on function public.loja_cobranca_do_pedido(uuid) to service_role;
