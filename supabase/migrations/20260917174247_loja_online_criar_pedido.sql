-- Criacao do pedido: TODO valor e recalculado aqui a partir do banco.
-- Nenhum preco vindo do navegador e usado. Atomica e idempotente.
create or replace function public.loja_criar_pedido(p jsonb) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare
  v_idem text;
  v_existente loja.pedidos%rowtype;
  v_modalidade loja.modalidade;
  v_nome text;
  v_telefone text;
  v_obs text;
  v_itens jsonb;
  v_item jsonb;
  v_prod loja.produtos%rowtype;
  v_qtd integer;
  v_opcao_ids uuid[];
  v_opcoes_snapshot jsonb;
  v_opcoes_total integer;
  v_unitario integer;
  v_linha_total integer;
  v_subtotal integer := 0;
  v_taxa integer := 0;
  v_bairro loja.bairros%rowtype;
  v_bairro_id uuid;
  v_bairro_nome text;
  v_pedido_id uuid;
  v_numero text;
  v_token text;
  v_ordem integer := 0;
  v_grupo record;
  v_escolhas integer;
  v_minimo integer;
  v_aberta boolean;
  v_aceita boolean;
  v_item_obs text;
begin
  -- 1) Idempotencia: mesma chave devolve o pedido ja criado
  v_idem := nullif(trim(p->>'idempotency_key'), '');
  if v_idem is not null then
    select * into v_existente from loja.pedidos where idempotency_key = v_idem;
    if found then
      return jsonb_build_object(
        'id', v_existente.id, 'numero_publico', v_existente.numero_publico,
        'token_acompanhamento', v_existente.token_acompanhamento,
        'subtotal_centavos', v_existente.subtotal_centavos,
        'taxa_entrega_centavos', v_existente.taxa_entrega_centavos,
        'total_centavos', v_existente.total_centavos,
        'duplicado', true);
    end if;
  end if;

  -- 2) Loja aberta?
  select coalesce((valor #>> '{}')::boolean, true) into v_aberta
    from loja.config where chave = 'publico.loja_aberta';
  if not coalesce(v_aberta, true) then
    raise exception 'LOJA_FECHADA: a loja nao esta aceitando pedidos no momento';
  end if;

  -- 3) Modalidade
  begin
    v_modalidade := (p->>'modalidade')::loja.modalidade;
  exception when others then
    raise exception 'MODALIDADE_INVALIDA: informe entrega ou retirada';
  end;

  select coalesce((valor #>> '{}')::boolean, true) into v_aceita
    from loja.config
   where chave = case when v_modalidade = 'entrega'
                      then 'publico.aceita_entrega' else 'publico.aceita_retirada' end;
  if not coalesce(v_aceita, true) then
    raise exception 'MODALIDADE_INDISPONIVEL: modalidade % indisponivel', v_modalidade;
  end if;

  -- 4) Dados do cliente
  v_nome := nullif(trim(p#>>'{cliente,nome}'), '');
  v_telefone := regexp_replace(coalesce(p#>>'{cliente,telefone}', ''), '\D', '', 'g');
  if v_nome is null or length(v_nome) < 2 or length(v_nome) > 80 then
    raise exception 'NOME_INVALIDO: informe o nome do cliente';
  end if;
  if length(v_telefone) < 10 or length(v_telefone) > 13 then
    raise exception 'TELEFONE_INVALIDO: informe um telefone valido com DDD';
  end if;
  v_obs := left(nullif(trim(p->>'observacao'), ''), 500);

  -- 5) Itens
  v_itens := coalesce(p->'itens', '[]'::jsonb);
  if jsonb_typeof(v_itens) <> 'array' or jsonb_array_length(v_itens) = 0 then
    raise exception 'CARRINHO_VAZIO: adicione ao menos um item';
  end if;
  if jsonb_array_length(v_itens) > 50 then
    raise exception 'CARRINHO_GRANDE: no maximo 50 linhas por pedido';
  end if;

  v_numero := loja.gerar_numero_publico();
  v_token := replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '');

  -- 6) Endereco / taxa de entrega
  if v_modalidade = 'entrega' then
    v_bairro_id := nullif(p#>>'{endereco,bairro_id}', '')::uuid;
    if v_bairro_id is null then
      raise exception 'BAIRRO_OBRIGATORIO: selecione o bairro de entrega';
    end if;
    select * into v_bairro from loja.bairros where id = v_bairro_id and ativo;
    if not found then
      raise exception 'BAIRRO_INDISPONIVEL: bairro nao atendido';
    end if;
    v_taxa := v_bairro.taxa_centavos;
    v_bairro_nome := v_bairro.nome;

    if nullif(trim(p#>>'{endereco,logradouro}'), '') is null
       or nullif(trim(p#>>'{endereco,numero}'), '') is null then
      raise exception 'ENDERECO_INCOMPLETO: informe rua e numero';
    end if;
  end if;

  insert into loja.pedidos (
    numero_publico, token_acompanhamento, modalidade,
    cliente_nome, cliente_telefone,
    endereco_logradouro, endereco_numero, endereco_complemento,
    endereco_bairro, endereco_referencia, bairro_id,
    observacao, subtotal_centavos, taxa_entrega_centavos, total_centavos,
    idempotency_key
  ) values (
    v_numero, v_token, v_modalidade, v_nome, v_telefone,
    case when v_modalidade = 'entrega' then left(trim(p#>>'{endereco,logradouro}'), 160) end,
    case when v_modalidade = 'entrega' then left(trim(p#>>'{endereco,numero}'), 20) end,
    case when v_modalidade = 'entrega' then left(nullif(trim(p#>>'{endereco,complemento}'), ''), 80) end,
    v_bairro_nome,
    case when v_modalidade = 'entrega' then left(nullif(trim(p#>>'{endereco,referencia}'), ''), 160) end,
    v_bairro_id,
    v_obs, 0, v_taxa, v_taxa, v_idem
  ) returning id into v_pedido_id;

  -- 7) Cada item: preco vem do banco, opcoes sao validadas contra o produto
  for v_item in select * from jsonb_array_elements(v_itens)
  loop
    v_ordem := v_ordem + 1;

    select * into v_prod from loja.produtos
     where id = nullif(v_item->>'produto_id', '')::uuid and ativo;
    if not found then
      raise exception 'PRODUTO_INVALIDO: produto nao encontrado no cardapio';
    end if;
    if not v_prod.disponivel then
      raise exception 'PRODUTO_INDISPONIVEL: % esta indisponivel', v_prod.nome;
    end if;

    v_qtd := coalesce((v_item->>'quantidade')::integer, 0);
    if v_qtd < 1 or v_qtd > 50 then
      raise exception 'QUANTIDADE_INVALIDA: quantidade invalida para %', v_prod.nome;
    end if;

    select coalesce(array_agg(x::uuid), '{}')
      into v_opcao_ids
      from jsonb_array_elements_text(coalesce(v_item->'opcao_ids', '[]'::jsonb)) x;

    -- opcoes precisam pertencer a este produto e estar disponiveis
    if array_length(v_opcao_ids, 1) is not null then
      if (select count(*) from loja.opcoes o
           join loja.opcao_grupos g on g.id = o.grupo_id
          where o.id = any(v_opcao_ids) and g.produto_id = v_prod.id
            and o.ativo and o.disponivel and g.ativo) <> array_length(v_opcao_ids, 1)
      then
        raise exception 'OPCAO_INVALIDA: opcao invalida ou indisponivel para %', v_prod.nome;
      end if;
    end if;

    -- regras de min/max por grupo
    for v_grupo in
      select * from loja.opcao_grupos where produto_id = v_prod.id and ativo
    loop
      select count(*) into v_escolhas
        from loja.opcoes o
       where o.grupo_id = v_grupo.id and o.id = any(coalesce(v_opcao_ids, '{}'));
      if v_escolhas < v_grupo.min_escolhas then
        raise exception 'GRUPO_MINIMO: escolha ao menos % opcao(oes) em "%" (%)',
          v_grupo.min_escolhas, v_grupo.nome, v_prod.nome;
      end if;
      if v_grupo.max_escolhas is not null and v_escolhas > v_grupo.max_escolhas then
        raise exception 'GRUPO_MAXIMO: no maximo % opcao(oes) em "%" (%)',
          v_grupo.max_escolhas, v_grupo.nome, v_prod.nome;
      end if;
    end loop;

    select coalesce(sum(o.preco_centavos), 0),
           coalesce(jsonb_agg(jsonb_build_object('nome', o.nome,
                     'preco_centavos', o.preco_centavos) order by o.ordem, o.nome),
                    '[]'::jsonb)
      into v_opcoes_total, v_opcoes_snapshot
      from loja.opcoes o
     where o.id = any(coalesce(v_opcao_ids, '{}'));

    v_unitario := v_prod.preco_centavos + coalesce(v_opcoes_total, 0);
    v_linha_total := v_unitario * v_qtd;
    v_subtotal := v_subtotal + v_linha_total;
    v_item_obs := left(nullif(trim(v_item->>'observacao'), ''), 300);

    insert into loja.pedido_itens (
      pedido_id, produto_id, nome_snapshot, preco_unitario_centavos,
      quantidade, observacao, opcoes_snapshot, total_centavos, ordem
    ) values (
      v_pedido_id, v_prod.id, v_prod.nome, v_unitario,
      v_qtd, v_item_obs, coalesce(v_opcoes_snapshot, '[]'::jsonb), v_linha_total, v_ordem
    );
  end loop;

  -- 8) Pedido minimo (sobre o subtotal, sem a taxa)
  select coalesce((valor #>> '{}')::integer, 0) into v_minimo
    from loja.config where chave = 'publico.pedido_minimo_centavos';
  if coalesce(v_minimo, 0) > 0 and v_subtotal < v_minimo then
    raise exception 'PEDIDO_MINIMO: pedido minimo de R$ %',
      to_char(v_minimo / 100.0, 'FM999990.00');
  end if;

  update loja.pedidos
     set subtotal_centavos = v_subtotal,
         total_centavos = v_subtotal + v_taxa
   where id = v_pedido_id;

  insert into loja.pedido_eventos (pedido_id, tipo, para, detalhe)
  values (v_pedido_id, 'pedido_criado', 'recebido',
          jsonb_build_object('itens', jsonb_array_length(v_itens)));

  return jsonb_build_object(
    'id', v_pedido_id, 'numero_publico', v_numero, 'token_acompanhamento', v_token,
    'subtotal_centavos', v_subtotal, 'taxa_entrega_centavos', v_taxa,
    'total_centavos', v_subtotal + v_taxa, 'duplicado', false);
end $$;

revoke all on function public.loja_criar_pedido(jsonb) from public;
revoke all on function public.loja_criar_pedido(jsonb) from anon;
revoke all on function public.loja_criar_pedido(jsonb) from authenticated;
grant execute on function public.loja_criar_pedido(jsonb) to service_role;
