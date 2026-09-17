-- Superficie publica de LEITURA do catalogo.
-- Fica em `public` porque e o schema exposto pelo PostgREST; o schema `loja`
-- continua isolado e inacessivel diretamente pelo navegador.
create or replace function public.loja_catalogo() returns jsonb
language sql stable security definer set search_path = loja, public as $$
  select jsonb_build_object(
    'categorias', coalesce((
      select jsonb_agg(c order by c.ordem, c.nome) from (
        select cat.id, cat.slug, cat.nome, cat.descricao, cat.ordem,
          coalesce((
            select jsonb_agg(p order by p.ordem, p.nome) from (
              select pr.id, pr.categoria_id, pr.slug, pr.nome, pr.descricao,
                     pr.preco_centavos, pr.imagem_url, pr.disponivel,
                     pr.provisorio, pr.ordem,
                coalesce((
                  select jsonb_agg(g order by g.ordem, g.nome) from (
                    select gr.id, gr.nome, gr.tipo, gr.min_escolhas,
                           gr.max_escolhas, gr.ordem,
                      coalesce((
                        select jsonb_agg(o order by o.ordem, o.nome) from (
                          select op.id, op.nome, op.preco_centavos,
                                 op.disponivel, op.ordem
                            from loja.opcoes op
                           where op.grupo_id = gr.id and op.ativo
                        ) o
                      ), '[]'::jsonb) as opcoes
                      from loja.opcao_grupos gr
                     where gr.produto_id = pr.id and gr.ativo
                  ) g
                ), '[]'::jsonb) as grupos
                from loja.produtos pr
               where pr.categoria_id = cat.id and pr.ativo
            ) p
          ), '[]'::jsonb) as produtos
          from loja.categorias cat
         where cat.ativo
      ) c
    ), '[]'::jsonb),
    'bairros', coalesce((
      select jsonb_agg(
               jsonb_build_object('id', id, 'nome', nome, 'taxa_centavos', taxa_centavos)
               order by ordem, nome)
        from loja.bairros where ativo
    ), '[]'::jsonb),
    'config', coalesce((
      select jsonb_object_agg(replace(chave, 'publico.', ''), valor)
        from loja.config where chave like 'publico.%'
    ), '{}'::jsonb)
  );
$$;

grant execute on function public.loja_catalogo() to anon, authenticated, service_role;

-- Consulta de acompanhamento pelo cliente: exige numero + token opaco.
create or replace function public.loja_consultar_pedido(p_numero text, p_token text)
returns jsonb
language plpgsql stable security definer set search_path = loja, public as $$
declare
  p loja.pedidos%rowtype;
  v_pag loja.pagamentos%rowtype;
begin
  select * into p from loja.pedidos
   where numero_publico = p_numero and token_acompanhamento = p_token;
  if not found then
    return null;
  end if;

  select * into v_pag from loja.pagamentos
   where pedido_id = p.id order by criado_em desc limit 1;

  return jsonb_build_object(
    'numero_publico', p.numero_publico,
    'modalidade', p.modalidade,
    'status_pedido', p.status_pedido,
    'status_pagamento', p.status_pagamento,
    'cliente_nome', p.cliente_nome,
    'subtotal_centavos', p.subtotal_centavos,
    'taxa_entrega_centavos', p.taxa_entrega_centavos,
    'total_centavos', p.total_centavos,
    'criado_em', p.criado_em,
    'endereco', case when p.modalidade = 'entrega' then jsonb_build_object(
        'logradouro', p.endereco_logradouro, 'numero', p.endereco_numero,
        'complemento', p.endereco_complemento, 'bairro', p.endereco_bairro,
        'referencia', p.endereco_referencia) else null end,
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', i.nome_snapshot, 'quantidade', i.quantidade,
               'total_centavos', i.total_centavos,
               'opcoes', i.opcoes_snapshot, 'observacao', i.observacao)
             order by i.ordem)
        from loja.pedido_itens i where i.pedido_id = p.id
    ), '[]'::jsonb),
    'pagamento', case when v_pag.id is null then null else jsonb_build_object(
        'status', v_pag.status, 'qr_code', v_pag.qr_code,
        'qr_code_imagem', v_pag.qr_code_imagem, 'expira_em', v_pag.expira_em
      ) end
  );
end $$;

revoke all on function public.loja_consultar_pedido(text, text) from public;
revoke all on function public.loja_consultar_pedido(text, text) from anon;
grant execute on function public.loja_consultar_pedido(text, text) to service_role;
