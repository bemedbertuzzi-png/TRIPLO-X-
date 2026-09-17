-- Registra a cobranca Pix criada no provedor
create or replace function public.loja_registrar_cobranca(
  p_pedido_id uuid, p_provedor text, p_cobranca_id text, p_txid text,
  p_valor_centavos integer, p_qr_code text, p_qr_code_imagem text, p_expira_em timestamptz
) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare v_id uuid;
begin
  insert into loja.pagamentos (pedido_id, provedor, cobranca_id, txid, status,
                               valor_centavos, qr_code, qr_code_imagem, expira_em)
  values (p_pedido_id, p_provedor, p_cobranca_id, p_txid, 'pendente',
          p_valor_centavos, p_qr_code, p_qr_code_imagem, p_expira_em)
  on conflict (provedor, cobranca_id) do update
    set qr_code = excluded.qr_code,
        qr_code_imagem = excluded.qr_code_imagem,
        expira_em = excluded.expira_em
  returning id into v_id;

  insert into loja.pedido_eventos (pedido_id, tipo, detalhe)
  values (p_pedido_id, 'cobranca_criada',
          jsonb_build_object('provedor', p_provedor, 'cobranca_id', p_cobranca_id));

  return jsonb_build_object('pagamento_id', v_id);
end $$;

-- Wrapper publico (exposto ao PostgREST) da confirmacao idempotente
create or replace function public.loja_confirmar_pagamento(
  p_pedido_id uuid, p_provedor text, p_cobranca_id text default null,
  p_payload jsonb default null
) returns jsonb
language sql security definer set search_path = loja, public as $$
  select loja.confirmar_pagamento(p_pedido_id, p_provedor, p_cobranca_id, p_payload);
$$;

-- Estados de pagamento que nao sao "pago" (expirado, falhou, estornado)
create or replace function public.loja_atualizar_status_pagamento(
  p_pedido_id uuid, p_status text, p_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare v_antes text;
begin
  select status_pagamento::text into v_antes from loja.pedidos where id = p_pedido_id;
  if v_antes is null then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;
  -- um pedido ja pago nunca regride por evento atrasado, exceto estorno
  if v_antes = 'pago' and p_status <> 'estornado' then
    return jsonb_build_object('alterado', false, 'status', v_antes);
  end if;

  update loja.pedidos set status_pagamento = p_status::loja.status_pagamento
   where id = p_pedido_id;
  update loja.pagamentos set status = p_status::loja.status_pagamento,
         payload_retorno = coalesce(p_payload, payload_retorno)
   where pedido_id = p_pedido_id;

  insert into loja.pedido_eventos (pedido_id, tipo, de, para, detalhe)
  values (p_pedido_id, 'pagamento', v_antes, p_status, p_payload);

  return jsonb_build_object('alterado', true, 'status', p_status);
end $$;

-- Idempotencia de webhook: retorna true apenas na PRIMEIRA vez que o evento chega
create or replace function public.loja_registrar_webhook(
  p_provedor text, p_evento_id text, p_payload jsonb
) returns boolean
language plpgsql security definer set search_path = loja, public as $$
begin
  insert into loja.webhook_eventos (provedor, evento_id, payload)
  values (p_provedor, p_evento_id, p_payload);
  return true;
exception when unique_violation then
  return false;
end $$;

-- Fila de impressao: o agente local reivindica lotes; evita imprimir duas vezes
create or replace function public.loja_fila_impressao(p_limite integer default 5)
returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare v_res jsonb;
begin
  with alvo as (
    select i.id from loja.impressoes i
     where i.status = 'pendente' and i.tentativas < 5
     order by i.criado_em
     limit greatest(1, least(coalesce(p_limite, 5), 20))
     for update skip locked
  ), atualizado as (
    update loja.impressoes i
       set status = 'processando', tentativas = i.tentativas + 1, reivindicado_em = now()
      from alvo where i.id = alvo.id
      returning i.id, i.pedido_id, i.destino, i.conteudo
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id, 'destino', a.destino, 'conteudo', a.conteudo,
           'numero_publico', (select numero_publico from loja.pedidos where id = a.pedido_id)
         )), '[]'::jsonb) into v_res from atualizado a;
  return v_res;
end $$;

create or replace function public.loja_confirmar_impressao(
  p_id uuid, p_ok boolean, p_erro text default null
) returns void
language plpgsql security definer set search_path = loja, public as $$
begin
  if p_ok then
    update loja.impressoes set status = 'impresso', impresso_em = now(), erro = null
     where id = p_id;
  else
    -- volta para a fila ate esgotar as tentativas
    update loja.impressoes
       set status = case when tentativas >= 5 then 'erro' else 'pendente' end,
           erro = left(p_erro, 500)
     where id = p_id;
  end if;
end $$;

create or replace function public.loja_atualizar_status_pedido(
  p_numero text, p_status text
) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare v_antes text; v_id uuid;
begin
  select id, status_pedido::text into v_id, v_antes
    from loja.pedidos where numero_publico = p_numero;
  if v_id is null then raise exception 'PEDIDO_NAO_ENCONTRADO'; end if;

  update loja.pedidos set status_pedido = p_status::loja.status_pedido where id = v_id;
  insert into loja.pedido_eventos (pedido_id, tipo, de, para)
  values (v_id, 'status_pedido', v_antes, p_status);

  return jsonb_build_object('numero_publico', p_numero, 'de', v_antes, 'para', p_status);
end $$;

-- Expira cobrancas vencidas que nunca foram pagas
create or replace function public.loja_expirar_pagamentos() returns integer
language plpgsql security definer set search_path = loja, public as $$
declare v_qtd integer;
begin
  with vencidos as (
    select p.id from loja.pedidos p
     join loja.pagamentos pg on pg.pedido_id = p.id
    where p.status_pagamento = 'pendente'
      and pg.expira_em is not null and pg.expira_em < now()
  )
  update loja.pedidos set status_pagamento = 'expirado'
   where id in (select id from vencidos);
  get diagnostics v_qtd = row_count;

  update loja.pagamentos set status = 'expirado'
   where status = 'pendente' and expira_em is not null and expira_em < now();

  return v_qtd;
end $$;

create or replace function public.loja_listar_pedidos(p_limite integer default 40)
returns jsonb
language sql security definer set search_path = loja, public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'numero_publico', numero_publico, 'modalidade', modalidade,
      'cliente_nome', cliente_nome, 'cliente_telefone', cliente_telefone,
      'total_centavos', total_centavos, 'status_pagamento', status_pagamento,
      'status_pedido', status_pedido, 'criado_em', criado_em,
      'comanda_pedido_id', comanda_pedido_id
    ) order by criado_em desc), '[]'::jsonb)
  from (select * from loja.pedidos order by criado_em desc
         limit greatest(1, least(coalesce(p_limite, 40), 200))) t;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.loja_registrar_cobranca(uuid,text,text,text,integer,text,text,timestamptz)',
    'public.loja_confirmar_pagamento(uuid,text,text,jsonb)',
    'public.loja_atualizar_status_pagamento(uuid,text,jsonb)',
    'public.loja_registrar_webhook(text,text,jsonb)',
    'public.loja_fila_impressao(integer)',
    'public.loja_confirmar_impressao(uuid,boolean,text)',
    'public.loja_atualizar_status_pedido(text,text)',
    'public.loja_expirar_pagamentos()',
    'public.loja_listar_pedidos(integer)'
  ] loop
    execute format('revoke all on function %s from public', f);
    execute format('revoke all on function %s from anon', f);
    execute format('revoke all on function %s from authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
