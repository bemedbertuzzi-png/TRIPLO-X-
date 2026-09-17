# Impressão — Jetway JP-800

## O ponto que não dá para contornar

A aplicação roda na Vercel, na internet. A impressora está na loja, numa rede
local, sem IP público. **A Vercel não alcança a impressora e não vai alcançar,
por mais bem configurado que esteja o deploy.**

Quem faz a ponte é o **agente de impressão** (`agente-impressao/agente.mjs`):
um processo que roda no computador da loja, busca os cupons na fila pela
internet e manda para a impressora pela rede local.

> Se esse processo não estiver rodando, nenhum pedido é impresso — ainda que
> o site esteja no ar e recebendo pedidos normalmente.

## Como funciona

```
Vercel                          Computador da loja
┌────────────────┐              ┌──────────────────────┐
│ fila de        │ ◄─ polling ──│ agente.mjs           │
│ impressão      │              │        │             │
│ (loja.impressoes)│ ── cupom ──►│        ▼             │
│                │              │   Jetway JP-800      │
│                │ ◄── confirma │   (USB ou rede)      │
└────────────────┘              └──────────────────────┘
```

1. A cada `POLL_MS`, o agente chama `GET /api/impressao/fila`.
2. O servidor devolve até `LOTE` cupons e **já os marca como `processando`**,
   com `FOR UPDATE SKIP LOCKED`. Duas cópias do agente rodando ao mesmo tempo
   não imprimem o mesmo pedido.
3. O agente imprime e confirma com `POST /api/impressao/fila`.
4. Falhou? O item volta para a fila, até 5 tentativas; depois fica como `erro`.

Além disso, `loja.impressoes` tem `unique (pedido_id, destino)`: mesmo que a
confirmação de pagamento seja chamada várias vezes, só existe uma linha de
impressão por pedido.

## Instalação no computador da loja

Requisitos: **Node.js 20 ou superior** e a impressora já instalada e testada
pelo Windows/Linux.

```bash
# 1. copie a pasta agente-impressao/ para o computador da loja
cd agente-impressao
cp .env.example .env
# 2. edite o .env
node agente.mjs
```

### Configuração do `.env`

```ini
BASE_URL=https://seu-app.vercel.app
IMPRESSAO_TOKEN=<mesmo valor configurado na Vercel>
POLL_MS=5000
IMPRESSORA_MODO=arquivo
IMPRESSORA_DESTINO=\\.\USB001
```

`IMPRESSORA_MODO` aceita:

| Modo | Quando usar | `DESTINO` / `COMANDO` |
|---|---|---|
| `console` | Testar sem impressora — só mostra o cupom na tela | — |
| `arquivo` | Windows com porta USB ou compartilhamento | `\\.\USB001`, `\\PC-CAIXA\JP800`, `/dev/usb/lp0` |
| `comando` | Linux/macOS com CUPS | `lp -d JP800 -o raw` |

Comece sempre em `console` para confirmar que os cupons estão chegando, e só
depois troque para o modo real.

### Deixar rodando sozinho

- **Windows**: crie uma tarefa no Agendador de Tarefas com gatilho
  “Ao iniciar o computador”, ação `node C:\caminho\agente.mjs`, marcada para
  “Executar estando o usuário conectado ou não” e “Reiniciar se falhar”.
- **Linux**: um serviço systemd com `Restart=always`.

## Rede e permissões

- O agente faz **apenas conexões de saída** (HTTPS para a Vercel). Não é
  preciso abrir porta nenhuma no roteador da loja, nem IP fixo, nem DDNS.
- O computador precisa de acesso à internet e permissão de impressão.
- O `IMPRESSAO_TOKEN` fica **somente** no `.env` do computador da loja e nas
  variáveis da Vercel. Ele nunca é enviado ao navegador de ninguém.
- Se o token vazar, um terceiro poderia ler os cupons (nome, telefone e
  endereço dos clientes). Trocar o token invalida o antigo na hora: basta
  atualizá-lo na Vercel e no `.env` do agente.

## Acentuação

O agente envia o texto em `latin1`, que cobre os acentos do português nas
térmicas mais comuns. Se sair com caracteres trocados, ajuste a página de
código da impressora ou o encoding em `enviarParaImpressora()`.

## O que ainda não foi testado

A impressão **não foi testada com a JP-800 real** — não há acesso físico ao
equipamento a partir deste ambiente. O que está testado é a fila: enfileira,
entrega uma única vez, confirma e retenta.

O primeiro teste na loja deve ser: rodar em `IMPRESSORA_MODO=console`,
confirmar que o cupom aparece corretamente, e só então trocar para o modo real.
