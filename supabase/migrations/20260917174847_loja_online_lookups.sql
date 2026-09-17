create or replace function public.loja_id_do_pedido(p_numero text) returns uuid
language sql stable security definer set search_path = loja, public as $$
  select id from loja.pedidos where numero_publico = p_numero;
$$;

create or replace function public.loja_pedido_por_cobranca(
  p_provedor text, p_cobranca_id text
) returns uuid
language sql stable security definer set search_path = loja, public as $$
  select pedido_id from loja.pagamentos
   where provedor = p_provedor and cobranca_id = p_cobranca_id
   limit 1;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.loja_id_do_pedido(text)',
    'public.loja_pedido_por_cobranca(text,text)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
