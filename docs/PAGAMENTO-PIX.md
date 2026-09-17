# Pagamento via Pix

## Estado

**Nenhum provedor Pix foi definido ainda.** O que existe:

- uma camada de abstração (`ProvedorPagamento`) que isola o resto do sistema
  de qual PSP será usado;
- o driver do **Mercado Pago** escrito por inteiro (cobrança, QR Code,
  webhook assinado) — falta apenas a credencial para ligar;
- um driver **`dev`**, para desenvolvimento, que **não confirma pagamento**.

## A regra que o driver `dev` respeita

O driver `dev` gera um BR Code estático real a partir de `PIX_CHAVE`. O QR
Code funciona e o dinheiro cai de verdade na conta. Mas uma chave estática
**não produz notificação**, então o sistema não tem como saber que foi paga.

Por isso:

- `consultarCobranca()` devolve sempre `pendente` — nunca `pago`;
- `confirmaAutomaticamente` é `false`;
- a fábrica `provedorPagamento()` **recusa carregar esse driver quando
  `NODE_ENV=production`**.

Nada no sistema marca um pedido como pago por conta própria. Clicar em
"já paguei" não existe como ação.

A única forma de confirmar sem PSP é uma pessoa conferindo o extrato e
chamando o endpoint administrativo:

```bash
curl -X POST https://seu-app.vercel.app/api/admin/pagamentos/confirmar \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"numero":"X260917-001","conferido_por":"Bernardo"}'
```

Isso exige o `ADMIN_TOKEN`, registra quem conferiu e grava
`confirmacao_manual: true` no payload. É uma conferência humana auditada, não
um pagamento simulado.

## Ligar o Mercado Pago

```ini
PAGAMENTO_PROVIDER=mercadopago
MERCADOPAGO_ACCESS_TOKEN=APP_USR-...
MERCADOPAGO_WEBHOOK_SECRET=...
```

No painel do Mercado Pago, cadastre o webhook apontando para
`https://seu-app.vercel.app/api/pagamentos/webhook`, evento **Pagamentos**.

### Como o webhook é tratado

1. **Assinatura conferida** — HMAC-SHA256 sobre
   `id:<id>;request-id:<req>;ts:<ts>;`, comparado em tempo constante.
   Requisição sem assinatura válida recebe 401 e nada acontece.
2. **Status relido na API** — o corpo do webhook nunca é a fonte da verdade.
   Mesmo com assinatura válida, o status vem de `GET /v1/payments/{id}`.
3. **Idempotência** — `loja_registrar_webhook` tem `unique (provedor,
   evento_id)`; reentrega devolve 200 sem reprocessar.
4. **Confirmação idempotente** — `loja_confirmar_pagamento` verifica se o
   pedido já está pago antes de agir.

### Rede de segurança

Webhook pode se perder. A tela de pagamento chama
`POST /api/pagamentos/consultar` a cada 6 segundos enquanto o pagamento está
pendente; esse endpoint consulta a API do provedor e concilia. É o servidor
perguntando ao PSP — não o cliente afirmando que pagou.

## Estados tratados

| Estado | Origem | Efeito |
|---|---|---|
| `pendente` | cobrança criada | aguardando |
| `pago` | webhook ou consulta | enfileira impressão, espelha no painel |
| `expirado` | `loja_expirar_pagamentos()` ou provedor | cobrança vencida |
| `falhou` | provedor recusou | cliente pode gerar novo Pix |
| `estornado` | `refunded` / `charged_back` | único estado que reverte um pago |

Um pedido já pago **não regride** por evento atrasado, exceto estorno.

Para expirar cobranças vencidas periodicamente, agende um Cron Job da Vercel
chamando `loja_expirar_pagamentos()` (ver `docs/DEPLOY.md`).

## Trocar de provedor

Implemente `ProvedorPagamento` (`src/lib/pagamentos/tipos.ts`), registre o
driver em `src/lib/pagamentos/index.ts` e mude `PAGAMENTO_PROVIDER`. Nenhuma
rota, componente ou função SQL precisa mudar.

Para um PSP com certificado mTLS (Sicredi, Banrisul, Efí), o certificado vai
em variável de ambiente (base64) e é carregado num `Agent` HTTPS dentro do
driver — nunca em arquivo versionado.

## Não testado

O driver do Mercado Pago **não foi exercitado contra a API real**, porque não
há credenciais. O que está testado por unidade é o gerador de BR Code
(incluindo o CRC-16) e o cálculo de valores. A validação de assinatura segue a
documentação do provedor, mas precisa de um teste com evento real antes do
go-live.
