# Triplo Xis Lanches — Sistema de pedidos online

Aplicação de pedidos online do Triplo Xis Lanches (Osório/RS): cardápio
digital, carrinho, checkout, pagamento via Pix, acompanhamento do pedido e
integração com o sistema interno de comandas que já existe.

> **Este projeto não recria o painel de comandas.** O painel interno continua
> sendo o sistema operacional da cozinha. Aqui ficam apenas os pedidos que
> chegam pelo site, e eles são espelhados no painel interno quando pagos.

---

## Deploy rápido na Vercel

```bash
npm install
npm run build          # confirma que está tudo certo
```

Depois: Vercel → **Add New → Project** → suba esta pasta (ou ligue o repositório).
Em **Settings → Environment Variables**, adicione:

| Variável | Onde obter |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → `service_role` |
| `ADMIN_TOKEN` | gere: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `IMPRESSAO_TOKEN` | gere do mesmo jeito |

A URL e a chave publicável do Supabase já vêm em `.env.production` — sem elas o
cardápio subiria vazio. Sem a `SUPABASE_SERVICE_ROLE_KEY`, o site mostra o
cardápio e o carrinho, mas **não consegue fechar pedido**.

Passo a passo completo em [`docs/DEPLOY.md`](docs/DEPLOY.md).

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

> O cardápio oficial **já está carregado**: 10 categorias e 76 produtos,
> importados de `CardapioTriploX.2.pdf`. O arquivo `dados/cardapio.json` é a
> fonte de verdade — edite e rode `npm run seed` para publicar mudanças.

### Tamanhos (MINI, PEQ)

Em todo o cardápio o MINI custa exatamente R$ 2,00 a menos. Em vez de
duplicar 23 produtos, ele é um **grupo de tamanho obrigatório** com a opção
`Mini` valendo `-200` centavos. Assim o preço de vitrine continua idêntico ao
do cardápio impresso. O mesmo vale para as batatas em torre (`Pequena`,
`-1000`).

`loja_criar_pedido` recusa qualquer combinação cujo preço unitário final
fique em zero ou abaixo, então uma opção de desconto nunca pode ser abusada.

### Divergências corrigidas no PDF

Dois preços do cardápio impresso estavam inconsistentes e foram corrigidos
com aprovação do estabelecimento:

| Produto | No PDF | Cadastrado |
|---|---|---|
| Xis Coração c/ Cheddar | R$ 36,00 / MINI R$ 37,00 | R$ 39,00 / MINI R$ 37,00 |
| Xis Filé c/ Palmito | R$ 40,00 / MINI R$ 40,00 | R$ 40,00 / MINI R$ 38,00 |

Bebidas marcadas como **CONSULTAR** (cervejas, chopp, caipirinha, dose de
whisky) **não** foram cadastradas: não há preço definido e não é possível
vendê-las online sem um valor.

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

- Cardápio oficial completo: 10 categorias, 76 produtos, 162 opções
- Categorias, busca, personalização, tamanhos (MINI) e carrinho persistente
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
- **Imagens dos produtos**: nenhum produto tem foto ainda (`imagem_url` nulo);
  o layout já trata esse caso e mostra só o texto.
- **Bairros e taxas de entrega**: ainda não cadastrados. Existe apenas um
  bairro placeholder ("Centro", taxa R$ 0,00) — configurar antes de abrir.

O que exatamente falta está em cada documento acima e no relatório de entrega.
