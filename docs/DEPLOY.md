# Deploy e configuração

## Variáveis de ambiente

### Obrigatórias

| Variável | Onde | Descrição |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | navegador + servidor | `https://jqqkahibtnwzkevbrhcd.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | navegador + servidor | Chave publicável. Só lê o catálogo. |
| `SUPABASE_SERVICE_ROLE_KEY` | **só servidor** | Ignora RLS. Nunca prefixar com `NEXT_PUBLIC_`. |
| `ADMIN_TOKEN` | **só servidor** | Rotas administrativas. 32+ caracteres aleatórios. |
| `IMPRESSAO_TOKEN` | **só servidor** | Compartilhado com o agente de impressão. |
| `PAGAMENTO_PROVIDER` | **só servidor** | `dev` ou `mercadopago`. |

### Conforme o provedor Pix

| Variável | Quando |
|---|---|
| `PIX_CHAVE`, `PIX_BENEFICIARIO`, `PIX_CIDADE` | driver `dev` |
| `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET` | driver `mercadopago` |

### Opcionais

| Variável | Padrão |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | `http://localhost:3000` |
| `FISCAL_PROVIDER` | `nenhum` |

Gerar segredos:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Banco de dados

O schema `loja` e as funções `loja_*` **já estão aplicados** no projeto
`TRIPLO XIS COMANDAS` (`jqqkahibtnwzkevbrhcd`). Migrações aplicadas:

```
loja_online_catalogo              loja_online_criar_pedido
loja_online_pedidos               loja_online_api_operacional
loja_online_helpers               loja_online_lookups
loja_online_despacho_comandas     loja_online_lookup_cobranca
loja_online_confirmar_pagamento   loja_online_importar_cardapio
loja_online_api_catalogo          loja_online_hardening
```

Nenhuma delas altera o schema `public` do sistema de comandas, exceto por
adicionar funções novas com prefixo `loja_`.

**Não é preciso expor o schema `loja`** nas configurações de API do Supabase.
O acesso passa pelas funções em `public`. Expor `loja` abriria as tabelas de
pedido ao navegador — não faça isso.

## Deploy na Vercel

1. Importe o repositório `bemedbertuzzi-png/TRIPLO-X-`.
2. Framework: Next.js (detectado automaticamente). Nenhum ajuste de build.
3. Cadastre as variáveis acima em **Settings → Environment Variables**,
   marcando as sem `NEXT_PUBLIC_` apenas para Production/Preview.
4. Deploy.

> Com `NODE_ENV=production` e `PAGAMENTO_PROVIDER=dev`, a rota de Pix devolve
> 503 de propósito: o sistema se recusa a operar com um driver que não
> confirma pagamento. Configure um PSP real antes de abrir ao público.

### Webhook do provedor

Aponte para `https://<seu-dominio>/api/pagamentos/webhook`. A rota valida
assinatura e é idempotente; pode receber reentregas sem problema.

### Cron opcional — expirar cobranças

`vercel.json`:

```json
{ "crons": [{ "path": "/api/admin/expirar", "schedule": "*/15 * * * *" }] }
```

A rota ainda não existe; se quiser esse comportamento, ela deve chamar
`loja_expirar_pagamentos()` protegida por `ADMIN_TOKEN`.

## Imagens dos produtos

Duas opções:

1. **Supabase Storage** — crie um bucket público `produtos`, suba as fotos e
   use a URL pública em `imagem_url`. O `next.config.ts` já libera
   `**.supabase.co`.
2. **Arquivos no repositório** — coloque em `public/produtos/` e use
   `/produtos/xis-salada.jpg` como `imagem_url`.

Sem `imagem_url`, o card aparece só com texto — o layout já trata isso.

## Ordem sugerida de go-live

1. Carregar o cardápio oficial (`npm run seed`) e conferir preços e fotos.
2. Cadastrar os bairros com as taxas reais.
3. Configurar o PSP de Pix e testar uma cobrança de valor baixo de ponta a ponta.
4. Instalar o agente de impressão na loja, primeiro em modo `console`.
5. Revisar as policies do sistema de comandas (ver `docs/SEGURANCA.md`).
6. Ligar `operacao.despacho_comandas_ativo` e conferir o painel interno.
7. Fazer um pedido real completo antes de divulgar o link.
