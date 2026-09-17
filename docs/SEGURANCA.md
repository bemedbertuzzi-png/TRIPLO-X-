# Segurança

## Decisões tomadas

**Preço nunca vem do cliente.** O corpo do pedido só traz ids e quantidades.
`loja_criar_pedido` recalcula tudo a partir do cadastro. Existe um teste
garantindo que um `preco_centavos` injetado no corpo não sobrevive à
validação.

**Segredos só no servidor.** `SUPABASE_SERVICE_ROLE_KEY`, tokens de PSP,
`ADMIN_TOKEN` e `IMPRESSAO_TOKEN` nunca têm prefixo `NEXT_PUBLIC_`. O módulo
que cria o cliente admin importa `server-only`, o que faz o **build falhar**
se alguém tentar importá-lo de um componente de cliente.

**Tabelas de pedido fechadas.** RLS habilitado e **nenhuma policy** em
`pedidos`, `pedido_itens`, `pagamentos`, `impressoes`, `notas_fiscais`,
`pedido_eventos`, `webhook_eventos`. A chave anônima não lê nada disso. Só a
service role, usada no servidor, passa.

**Acompanhamento por token opaco.** O link do pedido leva 64 caracteres
aleatórios. Consulta com número certo e token errado devolve exatamente o
mesmo 404 de pedido inexistente — não dá para descobrir quais números existem.

**Idempotência em três camadas.** `idempotency_key` no pedido,
`unique (provedor, evento_id)` nos webhooks, `unique (pedido_id, destino)` na
impressão. Um duplo clique, um webhook reentregue ou um retry de rede não
geram pedido, cupom ou cobrança em dobro.

**Comparação de segredos em tempo constante.** `segredoConfere()` faz hash
SHA-256 antes do `timingSafeEqual`, para que segredos de tamanhos diferentes
não vazem informação pelo comprimento.

**Logs sem dado sensível.** `registrar()` grava número do pedido, status e
provedor. Nunca telefone, endereço, token ou payload de pagamento.

**Configuração pública é uma lista fechada.** Só chaves `publico.*` de
`loja.config` são legíveis pelo site. Segredos operacionais ficam fora.

## Riscos conhecidos

### 1. RLS aberta no sistema de comandas (pré-existente, não introduzido aqui)

As tabelas `public.pedidos` e `public.comandas` do sistema interno têm
policies `USING (true)` para `SELECT`, `INSERT` e `UPDATE`, concedidas ao
papel `public`:

```
comandas | atualizacao publica | UPDATE | qual: true
comandas | insercao publica    | INSERT | with_check: true
comandas | leitura publica     | SELECT | qual: true
pedidos  | atualizacao publica | UPDATE | qual: true
pedidos  | insercao publica    | INSERT | with_check: true
pedidos  | leitura publica     | SELECT | qual: true
```

**Consequência:** qualquer pessoa com a chave anônima — que fica visível no
navegador de quem usa o painel — pode ler todos os pedidos, alterar qualquer
comanda ou inserir pedidos falsos.

**Não foi alterado**, porque mexer nessas policies pode derrubar o painel em
produção. **Recomendação:** trocar por policies que exijam usuário autenticado,
e testar o painel logo em seguida. Se quiser, posso preparar a migração e o
ajuste no painel.

Isso é independente da loja online: o schema `loja` não usa essas policies.

### 2. Limitador de taxa por instância

`limitarTaxa()` é em memória. Em serverless, cada instância tem o próprio
contador, então ele segura abuso casual, não um ataque distribuído. Para
proteção real, use o Vercel Firewall ou um contador compartilhado.

### 3. `loja_catalogo()` é público por desenho

O cardápio precisa ser lido sem login. A função só devolve itens `ativo` e,
de `config`, apenas as chaves `publico.*`. O linter do Supabase sinaliza
funções `SECURITY DEFINER` executáveis por `anon` — esta é intencional.

### 4. Confirmação manual de pagamento

Existe e é protegida por `ADMIN_TOKEN`. Quem tiver esse token pode marcar um
pedido como pago sem dinheiro ter entrado. Trate-o como senha do caixa: valor
longo e aleatório, trocado se alguém sair da equipe.

### 5. Impressão não testada em hardware

Ver `docs/IMPRESSAO.md`.

## Checklist antes do go-live

- [ ] `ADMIN_TOKEN` e `IMPRESSAO_TOKEN` gerados aleatoriamente (32+ caracteres)
- [ ] `SUPABASE_SERVICE_ROLE_KEY` só na Vercel, nunca em arquivo versionado
- [ ] `PAGAMENTO_PROVIDER` com um PSP real (`dev` é recusado em produção)
- [ ] Webhook do PSP cadastrado e testado com evento real
- [ ] Policies do sistema de comandas revistas (risco 1)
- [ ] Agente de impressão rodando e reiniciando sozinho
- [ ] `operacao.despacho_comandas_ativo` ligado só depois de conferir o painel
