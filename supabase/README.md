# Migrações

Todas estas migrações **já foram aplicadas** no projeto Supabase
`TRIPLO XIS COMANDAS` (`jqqkahibtnwzkevbrhcd`) e estão registradas em
`supabase_migrations.schema_migrations`.

Elas estão versionadas aqui para que o schema seja reproduzível — por
exemplo, ao criar um ambiente de homologação separado.

Nenhuma delas altera tabelas, policies ou funções existentes do sistema de
comandas. O que fazem no schema `public` é apenas **adicionar** funções com
prefixo `loja_`.

## Aplicar num projeto novo

```bash
supabase link --project-ref <ref>
supabase db push
```

## Sincronizar com o remoto

```bash
supabase db pull
```

## Ordem

| Arquivo | O que faz |
|---|---|
| `…_catalogo` | Schema `loja`, catálogo, bairros, config, RLS |
| `…_pedidos` | Pedidos, itens, pagamentos, webhooks, impressão, notas |
| `…_helpers` | Fuso de Osório, numeração, triggers, cupom |
| `…_despacho_comandas` | Espelhamento no painel interno |
| `…_confirmar_pagamento` | Confirmação idempotente + config inicial |
| `…_api_catalogo` | `loja_catalogo`, `loja_consultar_pedido` |
| `…_criar_pedido` | `loja_criar_pedido` — preço autoritativo |
| `…_api_operacional` | Cobrança, webhook, fila de impressão, status |
| `…_lookups` | Buscas internas por número e cobrança |
| `…_lookup_cobranca` | Cobrança mais recente de um pedido |
| `…_importar_cardapio` | Seed idempotente do cardápio |
| `…_hardening` | `search_path` fixo e revogações extras |
