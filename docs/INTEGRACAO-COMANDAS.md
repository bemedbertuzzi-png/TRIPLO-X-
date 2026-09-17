# Integração com o sistema interno de comandas

## O que já existia

Projeto Supabase `TRIPLO XIS COMANDAS` (`jqqkahibtnwzkevbrhcd`), schema
`public`:

- `public.pedidos` — `id`, `numero`, `tipo` (padrão `'Mesa'`), `mesa`,
  `garcom`, `itens` (jsonb), `observacao`, `total`, `status` (padrão `'novo'`),
  `impresso`, `impresso_em`, `criado_em`, `comanda_id`
- `public.comandas` — comandas abertas

O formato de `itens` observado nos pedidos reais:

```json
[{ "nome": "Xis Salada", "qtd": 2, "preco": 25, "obs": "sem tomate" }]
```

com `total = Σ (preco × qtd)`.

**Nada disso foi alterado.** Nenhuma coluna, índice, policy ou função do
sistema de comandas foi modificada.

## Como o pedido online chega lá

A função `loja.despachar_para_comandas(pedido_id)` insere uma linha em
`public.pedidos` exatamente no formato acima:

| Campo | Valor |
|---|---|
| `tipo` | `'Delivery'` ou `'Retirada'` |
| `mesa` | `null` |
| `garcom` | `'Online'` |
| `itens` | itens do pedido, com opções e observação concatenadas em `obs` |
| `observacao` | `ONLINE <número> \| <cliente> - <telefone> \| <endereço> \| <obs>` |
| `total` | total do pedido, já com a taxa de entrega |
| `status` | `'novo'` |
| `impresso` | `false` |

A taxa de entrega entra como uma linha extra em `itens`
(`"Taxa de entrega"`), para que a soma continue batendo com `total` — a mesma
regra que o painel já usa.

`numero` segue o padrão diário observado: `max(numero) + 1` entre os pedidos
do dia, no fuso de Osório.

### Impressão sai de graça

Como o pedido entra com `impresso = false`, **o serviço de impressão que já
existe continua funcionando sem nenhuma alteração**: ele vai encontrar o
pedido online no mesmo lugar onde encontra os de mesa.

(O sistema online também tem a própria fila de impressão, em
`loja.impressoes`, para o caso de querer um cupom com mais detalhes de entrega.
Use uma das duas, não as duas, para não imprimir em dobro.)

### Nunca duplica

`despachar_para_comandas` é idempotente: grava `comanda_pedido_id` no pedido
online e, se chamada de novo, devolve o mesmo id sem inserir nada. Mesmo que o
webhook do provedor chegue cinco vezes, o painel recebe um pedido só.

## O despacho começa DESLIGADO

A chave `operacao.despacho_comandas_ativo` está como `false`:

```sql
-- ligar quando o painel estiver pronto para receber pedidos online
update loja.config
   set valor = 'true'::jsonb
 where chave = 'operacao.despacho_comandas_ativo';
```

Isso foi feito de propósito: escrever na tabela de produção do restaurante é
uma decisão consciente, não um efeito colateral do deploy. Enquanto estiver
desligado, os pedidos online são criados, pagos e enfileirados para impressão
normalmente, mas não aparecem no painel.

## Alterações necessárias no painel interno

Nenhuma é obrigatória para funcionar. Recomendadas:

1. **Mostrar o `tipo`** — hoje todos os pedidos são `'Mesa'`. Passarão a
   existir `'Delivery'` e `'Retirada'`, e a tela precisa deixar isso claro
   para a cozinha.
2. **Tratar `mesa = null`** — se a interface espera sempre um número de mesa,
   verifique se não quebra com nulo.
3. **Destacar pedidos `garcom = 'Online'`** — por exemplo, com uma cor
   diferente, já que são pedidos pagos antecipadamente.

Vale conferir o item 2 antes de ligar o despacho.

## Verificação feita

O fluxo foi executado de ponta a ponta contra o banco real: pedido criado,
pagamento confirmado duas vezes (simulando webhook reentregue), cupom
enfileirado uma única vez, despacho chamado duas vezes devolvendo o mesmo id.
A linha de teste em `public.pedidos` foi **removida** em seguida — a tabela
voltou aos mesmos 25 pedidos que tinha antes.
