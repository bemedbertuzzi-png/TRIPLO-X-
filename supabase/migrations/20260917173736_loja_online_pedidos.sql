-- Config: expor publicamente apenas chaves com prefixo "publico."
drop policy if exists "config leitura publica" on loja.config;
create policy "config leitura publica" on loja.config
  for select to anon, authenticated using (chave like 'publico.%');

do $$ begin
  create type loja.status_pagamento as enum ('pendente','pago','expirado','falhou','estornado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type loja.status_pedido as enum ('recebido','em_preparacao','pronto','saiu_entrega','finalizado','cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type loja.modalidade as enum ('entrega','retirada');
exception when duplicate_object then null; end $$;

create sequence if not exists loja.pedido_numero_seq;

create table if not exists loja.pedidos (
  id uuid primary key default gen_random_uuid(),
  numero_publico text not null unique,
  -- token opaco para o cliente acompanhar o pedido sem login
  token_acompanhamento text not null unique,

  modalidade loja.modalidade not null,
  cliente_nome text not null,
  cliente_telefone text not null,

  endereco_logradouro text,
  endereco_numero text,
  endereco_complemento text,
  endereco_bairro text,
  endereco_referencia text,
  bairro_id uuid references loja.bairros(id),

  observacao text,

  subtotal_centavos integer not null check (subtotal_centavos >= 0),
  taxa_entrega_centavos integer not null default 0 check (taxa_entrega_centavos >= 0),
  total_centavos integer not null check (total_centavos >= 0),

  forma_pagamento text not null default 'pix',
  status_pagamento loja.status_pagamento not null default 'pendente',
  status_pedido loja.status_pedido not null default 'recebido',

  -- id do pedido espelhado no sistema interno de comandas (public.pedidos.id)
  comanda_pedido_id bigint,
  despachado_em timestamptz,

  -- chave de idempotencia enviada pelo cliente para evitar pedido duplicado
  idempotency_key text unique,

  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),

  -- entrega exige endereco completo
  constraint pedidos_entrega_endereco check (
    modalidade <> 'entrega' or (
      endereco_logradouro is not null and endereco_numero is not null and endereco_bairro is not null
    )
  ),
  constraint pedidos_total_coerente check (total_centavos = subtotal_centavos + taxa_entrega_centavos)
);

create index if not exists pedidos_status_idx on loja.pedidos (status_pedido, criado_em desc);
create index if not exists pedidos_pagamento_idx on loja.pedidos (status_pagamento, criado_em desc);

-- Itens com snapshot: preservam nome/preco do momento da compra
create table if not exists loja.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references loja.pedidos(id) on delete cascade,
  produto_id uuid references loja.produtos(id) on delete set null,
  nome_snapshot text not null,
  preco_unitario_centavos integer not null check (preco_unitario_centavos >= 0),
  quantidade integer not null check (quantidade > 0),
  observacao text,
  -- [{ "nome": "...", "preco_centavos": 0 }]
  opcoes_snapshot jsonb not null default '[]'::jsonb,
  total_centavos integer not null check (total_centavos >= 0),
  ordem integer not null default 0
);

create index if not exists pedido_itens_pedido_idx on loja.pedido_itens (pedido_id, ordem);

create table if not exists loja.pagamentos (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references loja.pedidos(id) on delete cascade,
  provedor text not null,
  cobranca_id text,
  txid text,
  status loja.status_pagamento not null default 'pendente',
  valor_centavos integer not null check (valor_centavos >= 0),
  qr_code text,
  qr_code_imagem text,
  expira_em timestamptz,
  pago_em timestamptz,
  payload_retorno jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, cobranca_id)
);

create index if not exists pagamentos_pedido_idx on loja.pagamentos (pedido_id);

-- Idempotencia de webhooks: o mesmo evento nunca e processado duas vezes
create table if not exists loja.webhook_eventos (
  id uuid primary key default gen_random_uuid(),
  provedor text not null,
  evento_id text not null,
  payload jsonb,
  processado boolean not null default false,
  erro text,
  recebido_em timestamptz not null default now(),
  processado_em timestamptz,
  unique (provedor, evento_id)
);

-- Trilha de auditoria de mudancas de estado
create table if not exists loja.pedido_eventos (
  id bigint generated always as identity primary key,
  pedido_id uuid not null references loja.pedidos(id) on delete cascade,
  tipo text not null,
  de text,
  para text,
  detalhe jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists pedido_eventos_pedido_idx on loja.pedido_eventos (pedido_id, criado_em);

-- Fila de impressao: unique(pedido,destino) impede imprimir o mesmo pedido 2x
create table if not exists loja.impressoes (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references loja.pedidos(id) on delete cascade,
  destino text not null default 'cozinha',
  status text not null default 'pendente' check (status in ('pendente','processando','impresso','erro')),
  conteudo text not null,
  tentativas integer not null default 0,
  reivindicado_em timestamptz,
  impresso_em timestamptz,
  erro text,
  criado_em timestamptz not null default now(),
  unique (pedido_id, destino)
);

create index if not exists impressoes_fila_idx on loja.impressoes (status, criado_em);

-- Emissao fiscal (NFC-e modelo 65). Controle de duplicidade por pedido.
create table if not exists loja.notas_fiscais (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null unique references loja.pedidos(id) on delete cascade,
  provedor text not null default 'geranet',
  ambiente text not null check (ambiente in ('homologacao','producao')),
  modelo text not null default '65',
  status text not null default 'pendente' check (status in ('pendente','processando','emitida','erro','cancelada')),
  numero text,
  serie text,
  chave_acesso text,
  protocolo text,
  url_danfe text,
  url_xml text,
  tentativas integer not null default 0,
  erro text,
  payload_retorno jsonb,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- RLS habilitado e SEM policy publica: estas tabelas so sao acessiveis
-- pelo backend com service role (que ignora RLS). O navegador nunca le pedidos.
alter table loja.pedidos enable row level security;
alter table loja.pedido_itens enable row level security;
alter table loja.pagamentos enable row level security;
alter table loja.webhook_eventos enable row level security;
alter table loja.pedido_eventos enable row level security;
alter table loja.impressoes enable row level security;
alter table loja.notas_fiscais enable row level security;
