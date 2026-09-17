# Arquitetura

## Princípio central

> O navegador manda **o que** quer comprar. O servidor decide **quanto custa**.

O corpo enviado ao criar um pedido contém apenas `produto_id`, `quantidade`,
`opcao_ids` e observações. Qualquer campo de preço que venha do cliente é
descartado pela validação Zod e ignorado pelo banco. A função
`loja_criar_pedido` busca os preços no cadastro, valida disponibilidade e
regras dos grupos de opções, e só então grava.

## Por que tudo mora no mesmo projeto Supabase

O sistema de comandas já roda no projeto `TRIPLO XIS COMANDAS`
(`jqqkahibtnwzkevbrhcd`), no schema `public`. A loja online foi criada no
schema **`loja`**, no mesmo banco.

Isso foi escolhido de propósito: o espelhamento do pedido online para o painel
interno vira um `INSERT` dentro da mesma transação, em vez de uma chamada HTTP
entre dois serviços que pode falhar no meio e deixar um pedido pago sem chegar
à cozinha.

## Superfície de API

O PostgREST só expõe o schema `public`. Em vez de pedir para expor `loja`
(o que abriria as tabelas de pedido ao navegador), criamos funções finas em
`public`, com `GRANT` explícito:

| Função | Quem pode chamar | Para quê |
|---|---|---|
| `loja_catalogo()` | `anon` | Cardápio público |
| `loja_criar_pedido(jsonb)` | apenas `service_role` | Cria pedido, calcula preço |
| `loja_consultar_pedido(numero, token)` | apenas `service_role` | Acompanhamento |
| `loja_registrar_cobranca(...)` | apenas `service_role` | Registra cobrança Pix |
| `loja_confirmar_pagamento(...)` | apenas `service_role` | Confirmação idempotente |
| `loja_atualizar_status_pagamento(...)` | apenas `service_role` | Expirado / falhou / estornado |
| `loja_registrar_webhook(...)` | apenas `service_role` | Idempotência de webhook |
| `loja_fila_impressao(limite)` | apenas `service_role` | Agente de impressão |
| `loja_confirmar_impressao(...)` | apenas `service_role` | Confirma/retenta impressão |
| `loja_atualizar_status_pedido(...)` | apenas `service_role` | Status operacional |
| `loja_importar_cardapio(jsonb)` | apenas `service_role` | Seed do cardápio |

As tabelas de pedido têm RLS **habilitado e sem policy alguma** — ninguém com
a chave anônima consegue lê-las. Apenas a *service role*, usada só no
servidor, passa por cima do RLS.

## Modelo de dados (schema `loja`)

- `categorias`, `produtos`, `opcao_grupos`, `opcoes` — cardápio
- `bairros` — taxa de entrega configurável, nunca fixada em código
- `config` — chave/valor; chaves `publico.*` são as únicas legíveis pelo site
- `pedidos` — cabeçalho, endereço, totais, status de pagamento e de pedido
- `pedido_itens` — **snapshot** de nome, preço unitário e opções no momento da
  compra, para que alterar o cardápio depois não reescreva o histórico
- `pagamentos` — cobrança no provedor, QR Code, expiração, retorno
- `webhook_eventos` — `unique (provedor, evento_id)`: cada evento processa uma vez
- `pedido_eventos` — trilha de auditoria de toda mudança de estado
- `impressoes` — fila; `unique (pedido_id, destino)` impede imprimir duas vezes
- `notas_fiscais` — `unique (pedido_id)`, tentativas, ambiente, erro

Datas e horas usam `timestamptz`, sempre convertidas para
`America/Sao_Paulo` na exibição e na numeração diária (fuso de Osório/RS).

## Fluxo do pedido

```
cliente monta o carrinho (localStorage)
        │
        ▼
POST /api/pedidos ──► loja_criar_pedido()
        │               • recalcula todos os preços
        │               • valida disponibilidade e grupos
        │               • aplica taxa do bairro e pedido mínimo
        │               • idempotency_key impede duplicar
        ▼
pedido criado: status_pagamento = pendente
        │
        ▼
POST /api/pagamentos/pix ──► provedor cria a cobrança
        │                    (reaproveita se já houver pendente válida)
        ▼
cliente paga
        │
        ├── webhook do provedor ──┐
        └── consulta periódica ───┤ (rede de segurança se o webhook se perder)
                                  ▼
                      loja_confirmar_pagamento()
                        • idempotente
                        • enfileira o cupom de impressão
                        • espelha no painel de comandas (se ligado)
                                  ▼
                      pedido pago → cozinha
```

## Estados

**Pagamento:** `pendente` → `pago` | `expirado` | `falhou` | `estornado`

Um pedido já `pago` nunca regride por evento atrasado; só `estornado` o altera.

**Pedido:** `recebido` → `em_preparacao` → `pronto` → `saiu_entrega` →
`finalizado`, ou `cancelado`.

## Onde fica a camada visual

A identidade está isolada em:

- `src/app/globals.css` — tokens de cor, raio, tipografia
- `src/components/*` — componentes de apresentação
- `public/marca/` — logo

Nenhuma regra de negócio vive nesses arquivos. Aplicar o projeto aprovado do
Claude Design significa trocar tokens e componentes, sem tocar em `src/lib`,
`src/app/api` nem nas funções SQL.
