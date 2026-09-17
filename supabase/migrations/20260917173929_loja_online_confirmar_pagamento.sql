-- Confirmacao de pagamento: atomica e idempotente.
-- Chamar mais de uma vez (webhook reentregue) nao duplica pedido nem impressao.
create or replace function loja.confirmar_pagamento(
  p_pedido_id uuid,
  p_provedor text,
  p_cobranca_id text default null,
  p_payload jsonb default null
) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare
  p loja.pedidos%rowtype;
  v_despacho_ativo boolean;
  v_comanda_id bigint;
  v_ja_pago boolean := false;
begin
  select * into p from loja.pedidos where id = p_pedido_id for update;
  if not found then raise exception 'pedido % nao encontrado', p_pedido_id; end if;

  if p.status_pagamento = 'pago' then
    v_ja_pago := true;
  else
    update loja.pagamentos
       set status = 'pago',
           pago_em = now(),
           payload_retorno = coalesce(p_payload, payload_retorno)
     where pedido_id = p_pedido_id
       and provedor = p_provedor
       and (p_cobranca_id is null or cobranca_id = p_cobranca_id);

    update loja.pedidos
       set status_pagamento = 'pago'
     where id = p_pedido_id;

    insert into loja.pedido_eventos (pedido_id, tipo, de, para, detalhe)
    values (p_pedido_id, 'pagamento', p.status_pagamento::text, 'pago',
            jsonb_build_object('provedor', p_provedor, 'cobranca_id', p_cobranca_id));
  end if;

  -- fila de impressao: unique(pedido_id, destino) impede duplicar
  insert into loja.impressoes (pedido_id, destino, conteudo)
  values (p_pedido_id, 'cozinha', loja.montar_cupom(p_pedido_id))
  on conflict (pedido_id, destino) do nothing;

  select coalesce((valor #>> '{}')::boolean, false) into v_despacho_ativo
    from loja.config where chave = 'operacao.despacho_comandas_ativo';

  if coalesce(v_despacho_ativo, false) then
    v_comanda_id := loja.despachar_para_comandas(p_pedido_id);
  end if;

  return jsonb_build_object(
    'pedido_id', p_pedido_id,
    'numero_publico', p.numero_publico,
    'ja_estava_pago', v_ja_pago,
    'comanda_pedido_id', v_comanda_id,
    'despacho_ativo', coalesce(v_despacho_ativo, false)
  );
end $$;

revoke all on function loja.confirmar_pagamento(uuid, text, text, jsonb) from public;
revoke all on function loja.confirmar_pagamento(uuid, text, text, jsonb) from anon;
revoke all on function loja.confirmar_pagamento(uuid, text, text, jsonb) from authenticated;

-- Configuracao inicial. O despacho para o painel interno comeca DESLIGADO:
-- ligar e um passo consciente de go-live, para nao escrever na producao sem aval.
insert into loja.config (chave, valor, descricao) values
  ('operacao.despacho_comandas_ativo', 'false'::jsonb,
   'Quando true, pedidos pagos sao espelhados em public.pedidos (painel interno)'),
  ('publico.loja_aberta', 'true'::jsonb, 'Loja aceitando pedidos'),
  ('publico.pedido_minimo_centavos', '0'::jsonb, 'Valor minimo do pedido em centavos'),
  ('publico.taxa_entrega_padrao_centavos', '0'::jsonb,
   'Taxa usada quando o bairro nao tem taxa propria cadastrada'),
  ('publico.aceita_entrega', 'true'::jsonb, 'Modalidade entrega disponivel'),
  ('publico.aceita_retirada', 'true'::jsonb, 'Modalidade retirada disponivel'),
  ('publico.nome_loja', '"Triplo Xis Lanches"'::jsonb, 'Nome exibido'),
  ('publico.cidade', '"Osorio/RS"'::jsonb, 'Cidade'),
  ('pix.expiracao_segundos', '1800'::jsonb, 'Validade da cobranca Pix'),
  ('fiscal.ambiente', '"homologacao"'::jsonb, 'Ambiente de emissao fiscal')
on conflict (chave) do nothing;
