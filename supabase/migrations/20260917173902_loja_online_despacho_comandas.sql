-- Espelha o pedido online no sistema interno de comandas (public.pedidos).
-- Idempotente: so despacha uma vez por pedido.
create or replace function loja.despachar_para_comandas(p_pedido_id uuid) returns bigint
language plpgsql security definer set search_path = loja, public as $$
declare
  p loja.pedidos%rowtype;
  v_itens jsonb;
  v_numero integer;
  v_novo_id bigint;
  v_endereco text;
begin
  select * into p from loja.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'pedido % nao encontrado', p_pedido_id; end if;

  if p.comanda_pedido_id is not null then
    return p.comanda_pedido_id;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'nome', i.nome_snapshot,
             'qtd',  i.quantidade,
             'preco', round(i.total_centavos::numeric / i.quantidade / 100.0, 2),
             'obs', nullif(concat_ws(' | ',
                      nullif((select string_agg(o->>'nome', ', ')
                              from jsonb_array_elements(i.opcoes_snapshot) o), ''),
                      nullif(i.observacao, '')
                    ), '')
           ) order by i.ordem
         ), '[]'::jsonb)
    into v_itens
    from loja.pedido_itens i
   where i.pedido_id = p_pedido_id;

  if p.taxa_entrega_centavos > 0 then
    v_itens := v_itens || jsonb_build_array(jsonb_build_object(
      'nome', 'Taxa de entrega', 'qtd', 1,
      'preco', round(p.taxa_entrega_centavos::numeric / 100.0, 2), 'obs', null
    ));
  end if;

  select coalesce(max(numero), 0) + 1 into v_numero
    from public.pedidos
   where (criado_em at time zone 'America/Sao_Paulo')::date = (loja.agora_local())::date;

  if p.modalidade = 'entrega' then
    v_endereco := concat_ws(', ', p.endereco_logradouro, p.endereco_numero, p.endereco_bairro);
  else
    v_endereco := null;
  end if;

  insert into public.pedidos (numero, tipo, mesa, garcom, itens, observacao, total, status, impresso)
  values (
    v_numero,
    case when p.modalidade = 'entrega' then 'Delivery' else 'Retirada' end,
    null,
    'Online',
    v_itens,
    nullif(concat_ws(' | ',
      'ONLINE ' || p.numero_publico,
      p.cliente_nome || ' - ' || p.cliente_telefone,
      v_endereco,
      nullif(p.observacao, '')
    ), ''),
    round(p.total_centavos::numeric / 100.0, 2),
    'novo',
    false
  )
  returning id into v_novo_id;

  update loja.pedidos
     set comanda_pedido_id = v_novo_id, despachado_em = now()
   where id = p_pedido_id;

  insert into loja.pedido_eventos (pedido_id, tipo, detalhe)
  values (p_pedido_id, 'despachado_comandas', jsonb_build_object('comanda_pedido_id', v_novo_id));

  return v_novo_id;
end $$;

revoke all on function loja.despachar_para_comandas(uuid) from public;
revoke all on function loja.despachar_para_comandas(uuid) from anon;
revoke all on function loja.despachar_para_comandas(uuid) from authenticated;
