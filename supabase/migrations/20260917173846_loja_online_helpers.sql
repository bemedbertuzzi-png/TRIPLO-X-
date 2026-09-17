create or replace function loja.agora_local() returns timestamp
language sql stable as $$
  select (now() at time zone 'America/Sao_Paulo');
$$;

create or replace function loja.gerar_numero_publico() returns text
language sql volatile as $$
  select 'X' || to_char(loja.agora_local(), 'YYMMDD') || '-'
         || lpad((nextval('loja.pedido_numero_seq') % 1000)::text, 3, '0');
$$;

create or replace function loja.touch_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

drop trigger if exists pedidos_touch on loja.pedidos;
create trigger pedidos_touch before update on loja.pedidos
  for each row execute function loja.touch_atualizado_em();

drop trigger if exists pagamentos_touch on loja.pagamentos;
create trigger pagamentos_touch before update on loja.pagamentos
  for each row execute function loja.touch_atualizado_em();

drop trigger if exists produtos_touch on loja.produtos;
create trigger produtos_touch before update on loja.produtos
  for each row execute function loja.touch_atualizado_em();

-- Monta o cupom de cozinha (compativel com termica de 48 colunas)
create or replace function loja.montar_cupom(p_pedido_id uuid) returns text
language plpgsql stable as $$
declare
  p loja.pedidos%rowtype;
  txt text := '';
  it record;
  opc jsonb;
begin
  select * into p from loja.pedidos where id = p_pedido_id;
  if not found then raise exception 'pedido % nao encontrado', p_pedido_id; end if;

  txt := txt || '*** TRIPLO XIS LANCHES ***' || E'\n';
  txt := txt || 'PEDIDO ONLINE ' || p.numero_publico || E'\n';
  txt := txt || to_char(p.criado_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') || E'\n';
  txt := txt || '------------------------------------------------' || E'\n';
  txt := txt || upper(p.modalidade::text) || E'\n';
  txt := txt || 'Cliente: ' || p.cliente_nome || E'\n';
  txt := txt || 'Fone: ' || p.cliente_telefone || E'\n';

  if p.modalidade = 'entrega' then
    txt := txt || 'End: ' || coalesce(p.endereco_logradouro,'') || ', ' || coalesce(p.endereco_numero,'') || E'\n';
    if coalesce(p.endereco_complemento,'') <> '' then
      txt := txt || 'Compl: ' || p.endereco_complemento || E'\n';
    end if;
    txt := txt || 'Bairro: ' || coalesce(p.endereco_bairro,'') || E'\n';
    if coalesce(p.endereco_referencia,'') <> '' then
      txt := txt || 'Ref: ' || p.endereco_referencia || E'\n';
    end if;
  end if;

  txt := txt || '------------------------------------------------' || E'\n';

  for it in
    select * from loja.pedido_itens where pedido_id = p_pedido_id order by ordem
  loop
    txt := txt || it.quantidade || 'x ' || it.nome_snapshot
               || '  ' || to_char(it.total_centavos / 100.0, 'FM999990.00') || E'\n';
    for opc in select * from jsonb_array_elements(it.opcoes_snapshot)
    loop
      txt := txt || '   + ' || (opc->>'nome') || E'\n';
    end loop;
    if coalesce(it.observacao,'') <> '' then
      txt := txt || '   OBS: ' || it.observacao || E'\n';
    end if;
  end loop;

  txt := txt || '------------------------------------------------' || E'\n';
  txt := txt || 'Subtotal: ' || to_char(p.subtotal_centavos / 100.0, 'FM999990.00') || E'\n';
  if p.taxa_entrega_centavos > 0 then
    txt := txt || 'Entrega:  ' || to_char(p.taxa_entrega_centavos / 100.0, 'FM999990.00') || E'\n';
  end if;
  txt := txt || 'TOTAL:    ' || to_char(p.total_centavos / 100.0, 'FM999990.00') || E'\n';
  txt := txt || 'Pagamento: ' || upper(p.forma_pagamento) || ' - ' || upper(p.status_pagamento::text) || E'\n';

  if coalesce(p.observacao,'') <> '' then
    txt := txt || '------------------------------------------------' || E'\n';
    txt := txt || 'OBS PEDIDO: ' || p.observacao || E'\n';
  end if;

  return txt;
end $$;
