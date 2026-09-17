-- Schema dedicado ao sistema de pedidos online.
-- Nao altera nada do sistema interno de comandas (schema public).
create schema if not exists loja;

create table if not exists loja.categorias (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  nome text not null,
  descricao text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists loja.produtos (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid not null references loja.categorias(id) on delete restrict,
  slug text not null unique,
  nome text not null,
  descricao text,
  preco_centavos integer not null check (preco_centavos >= 0),
  imagem_url text,
  ordem integer not null default 0,
  ativo boolean not null default true,
  disponivel boolean not null default true,
  -- marca dados carregados provisoriamente (a partir do historico interno),
  -- ate o cardapio oficial ser cadastrado
  provisorio boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists produtos_categoria_idx on loja.produtos (categoria_id, ordem);
create index if not exists produtos_ativo_idx on loja.produtos (ativo, disponivel);

-- Grupos de opcoes/personalizacao por produto (ex.: "Adicionais", "Preparo")
create table if not exists loja.opcao_grupos (
  id uuid primary key default gen_random_uuid(),
  produto_id uuid not null references loja.produtos(id) on delete cascade,
  nome text not null,
  tipo text not null default 'multiplo' check (tipo in ('unico','multiplo')),
  min_escolhas integer not null default 0 check (min_escolhas >= 0),
  max_escolhas integer check (max_escolhas is null or max_escolhas > 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  constraint opcao_grupos_min_max check (max_escolhas is null or max_escolhas >= min_escolhas)
);

create index if not exists opcao_grupos_produto_idx on loja.opcao_grupos (produto_id, ordem);

create table if not exists loja.opcoes (
  id uuid primary key default gen_random_uuid(),
  grupo_id uuid not null references loja.opcao_grupos(id) on delete cascade,
  nome text not null,
  preco_centavos integer not null default 0 check (preco_centavos >= 0),
  ordem integer not null default 0,
  ativo boolean not null default true,
  disponivel boolean not null default true
);

create index if not exists opcoes_grupo_idx on loja.opcoes (grupo_id, ordem);

-- Taxa de entrega configuravel por bairro (nunca fixada em codigo)
create table if not exists loja.bairros (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  taxa_centavos integer not null check (taxa_centavos >= 0),
  ativo boolean not null default true,
  ordem integer not null default 0
);

-- Configuracao operacional chave/valor (loja aberta, pedido minimo, horarios...)
create table if not exists loja.config (
  chave text primary key,
  valor jsonb not null,
  descricao text,
  atualizado_em timestamptz not null default now()
);

alter table loja.categorias enable row level security;
alter table loja.produtos enable row level security;
alter table loja.opcao_grupos enable row level security;
alter table loja.opcoes enable row level security;
alter table loja.bairros enable row level security;
alter table loja.config enable row level security;

-- Leitura publica APENAS do catalogo ativo. Escrita somente via service role
-- (que ignora RLS), nunca pelo navegador.
create policy "catalogo leitura publica" on loja.categorias
  for select to anon, authenticated using (ativo);
create policy "catalogo leitura publica" on loja.produtos
  for select to anon, authenticated using (ativo);
create policy "catalogo leitura publica" on loja.opcao_grupos
  for select to anon, authenticated using (ativo);
create policy "catalogo leitura publica" on loja.opcoes
  for select to anon, authenticated using (ativo);
create policy "bairros leitura publica" on loja.bairros
  for select to anon, authenticated using (ativo);
create policy "config leitura publica" on loja.config
  for select to anon, authenticated using (true);
