-- Importacao idempotente do cardapio oficial.
-- Chave: slug. Itens ausentes do arquivo sao DESATIVADOS, nunca apagados,
-- para nao quebrar o historico de pedidos ja feitos.
create or replace function public.loja_importar_cardapio(p jsonb) returns jsonb
language plpgsql security definer set search_path = loja, public as $$
declare
  v_cat jsonb;
  v_prod jsonb;
  v_grupo jsonb;
  v_opcao jsonb;
  v_bairro jsonb;
  v_cat_id uuid;
  v_prod_id uuid;
  v_grupo_id uuid;
  v_ordem_cat integer := 0;
  v_ordem_prod integer;
  v_ordem_grupo integer;
  v_ordem_opcao integer;
  v_slugs_cat text[] := '{}';
  v_slugs_prod text[] := '{}';
  v_nomes_bairro text[] := '{}';
  v_chave text;
begin
  if jsonb_typeof(p->'categorias') <> 'array' then
    raise exception 'ARQUIVO_INVALIDO: campo categorias ausente';
  end if;

  for v_cat in select * from jsonb_array_elements(p->'categorias')
  loop
    v_ordem_cat := v_ordem_cat + 1;
    v_slugs_cat := v_slugs_cat || (v_cat->>'slug');

    insert into loja.categorias (slug, nome, descricao, ordem, ativo)
    values (v_cat->>'slug', v_cat->>'nome', v_cat->>'descricao', v_ordem_cat, true)
    on conflict (slug) do update
      set nome = excluded.nome, descricao = excluded.descricao,
          ordem = excluded.ordem, ativo = true
    returning id into v_cat_id;

    v_ordem_prod := 0;
    for v_prod in select * from jsonb_array_elements(coalesce(v_cat->'produtos', '[]'::jsonb))
    loop
      v_ordem_prod := v_ordem_prod + 1;
      v_slugs_prod := v_slugs_prod || (v_prod->>'slug');

      insert into loja.produtos (categoria_id, slug, nome, descricao, preco_centavos,
                                 imagem_url, ordem, ativo, disponivel, provisorio)
      values (v_cat_id, v_prod->>'slug', v_prod->>'nome', v_prod->>'descricao',
              (v_prod->>'preco_centavos')::integer, v_prod->>'imagem_url',
              v_ordem_prod, true, true, false)
      on conflict (slug) do update
        set categoria_id = excluded.categoria_id, nome = excluded.nome,
            descricao = excluded.descricao, preco_centavos = excluded.preco_centavos,
            imagem_url = excluded.imagem_url, ordem = excluded.ordem,
            ativo = true, provisorio = false
      returning id into v_prod_id;

      -- grupos sao reescritos por produto: a fonte da verdade e o arquivo
      delete from loja.opcao_grupos where produto_id = v_prod_id;

      v_ordem_grupo := 0;
      for v_grupo in select * from jsonb_array_elements(coalesce(v_prod->'grupos', '[]'::jsonb))
      loop
        v_ordem_grupo := v_ordem_grupo + 1;
        insert into loja.opcao_grupos (produto_id, nome, tipo, min_escolhas,
                                       max_escolhas, ordem, ativo)
        values (v_prod_id, v_grupo->>'nome',
                coalesce(v_grupo->>'tipo', 'multiplo'),
                coalesce((v_grupo->>'min_escolhas')::integer, 0),
                nullif(v_grupo->>'max_escolhas', 'null')::integer,
                v_ordem_grupo, true)
        returning id into v_grupo_id;

        v_ordem_opcao := 0;
        for v_opcao in select * from jsonb_array_elements(coalesce(v_grupo->'opcoes', '[]'::jsonb))
        loop
          v_ordem_opcao := v_ordem_opcao + 1;
          insert into loja.opcoes (grupo_id, nome, preco_centavos, ordem, ativo, disponivel)
          values (v_grupo_id, v_opcao->>'nome',
                  coalesce((v_opcao->>'preco_centavos')::integer, 0),
                  v_ordem_opcao, true, true);
        end loop;
      end loop;
    end loop;
  end loop;

  -- some do arquivo => sai do ar, mas continua existindo para o historico
  update loja.produtos set ativo = false where not (slug = any(v_slugs_prod));
  update loja.categorias set ativo = false where not (slug = any(v_slugs_cat));

  if jsonb_typeof(p->'bairros') = 'array' then
    for v_bairro in select * from jsonb_array_elements(p->'bairros')
    loop
      v_nomes_bairro := v_nomes_bairro || (v_bairro->>'nome');
      insert into loja.bairros (nome, taxa_centavos, ativo)
      values (v_bairro->>'nome', (v_bairro->>'taxa_centavos')::integer, true)
      on conflict (nome) do update
        set taxa_centavos = excluded.taxa_centavos, ativo = true;
    end loop;
    update loja.bairros set ativo = false where not (nome = any(v_nomes_bairro));
  end if;

  if jsonb_typeof(p->'config') = 'object' then
    for v_chave in select jsonb_object_keys(p->'config')
    loop
      insert into loja.config (chave, valor)
      values ('publico.' || v_chave, (p->'config')->v_chave)
      on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
    end loop;
  end if;

  return jsonb_build_object(
    'categorias', array_length(v_slugs_cat, 1),
    'produtos', array_length(v_slugs_prod, 1),
    'bairros', array_length(v_nomes_bairro, 1)
  );
end $$;

revoke all on function public.loja_importar_cardapio(jsonb) from public;
revoke all on function public.loja_importar_cardapio(jsonb) from anon;
revoke all on function public.loja_importar_cardapio(jsonb) from authenticated;
grant execute on function public.loja_importar_cardapio(jsonb) to service_role;
