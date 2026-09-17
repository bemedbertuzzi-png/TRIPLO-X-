# Triplo Xis Lanches — Sistema de pedidos online

Aplicação de pedidos online do Triplo Xis Lanches (Osório/RS): cardápio
digital, carrinho, checkout, pagamento via Pix, acompanhamento do pedido e
integração com o sistema interno de comandas que já existe.

> **Este projeto não recria o painel de comandas.** O painel interno continua
> sendo o sistema operacional da cozinha. Aqui ficam apenas os pedidos que
> chegam pelo site, e eles são espelhados no painel interno quando pagos.

---

## Stack

| Camada | Escolha |
|---|---|
| Frontend / backend | Next.js 15 (App Router), React 19, TypeScript estrito |
| Estilo | Tailwind CSS v4, tokens da marca em `src/app/globals.css` |
| Banco | Supabase / Postgres — schema `loja` |
| Validação | Zod no servidor; regras de negócio em SQL |
| Testes | Vitest |
| Deploy | Vercel |

## Arquitetura em uma frase

O navegador nunca fala com o banco a respeito de pedidos: ele chama rotas
`/api/*` do Next.js, que usam a *service role* para executar funções SQL
`loja_*` — e **todo preço é recalculado no banco**, a partir do cadastro.

Detalhes em [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md).

---

## Como rodar

```bash
npm install
cp .env.example .env.local     # preencha as variáveis
npm run dev                    # http://localhost:3000
```

Scripts:

```bash
npm run dev        # desenvolvimento
npm run build      # build de produção
npm run typecheck  # TypeScript, sem emitir
npm test           # testes unitários
npm run seed       # importa dados/cardapio.json para o banco
```

## Carregar o cardápio oficial

```bash
cp dados/cardapio.exemplo.json dados/cardapio.json
# edite com produtos, ingredientes, preços (em centavos) e imagens
npm run seed
```

A importação é idempotente: usa `slug` como chave, atualiza o que existe e
**desativa** (não apaga) o que sumiu do arquivo, preservando o histórico de
pedidos antigos.

> ⚠️ O catálogo hoje contém **10 produtos provisórios** (`provisorio = true`),
> extraídos do histórico real de pedidos do sistema interno, apenas para
> permitir testar o fluxo completo. Rodar `npm run seed` com o cardápio
> oficial substitui todos eles.

---

## Documentação

| Documento | Assunto |
|---|---|
| [ARQUITETURA.md](docs/ARQUITETURA.md) | Modelo de dados, fluxo do pedido, funções SQL |
| [DEPLOY.md](docs/DEPLOY.md) | Variáveis de ambiente, Vercel, webhooks, go-live |
| [PAGAMENTO-PIX.md](docs/PAGAMENTO-PIX.md) | Drivers de pagamento e o que falta para produção |
| [INTEGRACAO-COMANDAS.md](docs/INTEGRACAO-COMANDAS.md) | Como o pedido chega ao painel interno |
| [IMPRESSAO.md](docs/IMPRESSAO.md) | Agente local e a Jetway JP-800 |
| [FISCAL.md](docs/FISCAL.md) | NFC-e / Geranet — estado e pendências |
| [SEGURANCA.md](docs/SEGURANCA.md) | Decisões de segurança e riscos conhecidos |

---

## Estado atual

**Funcionando e testado**

- Cardápio, categorias, busca, personalização, carrinho persistente
- Checkout com validação em duas camadas (cliente e servidor)
- Criação de pedido com preço calculado no servidor e idempotência
- Fila de impressão com proteção contra impressão duplicada
- Espelhamento no painel de comandas, idempotente
- Acompanhamento do pedido por link com token opaco

**Depende de configuração externa**

- **Pix**: nenhum provedor foi definido ainda. Existe a camada de abstração e
  o driver do Mercado Pago escrito; falta credencial para ligar.
- **Emissão fiscal**: não implementada — falta a documentação da Geranet.
- **Impressão**: exige o agente rodando no computador da loja.
- **Despacho para comandas**: começa **desligado** por segurança.

O que exatamente falta está em cada documento acima e no relatório de entrega.
