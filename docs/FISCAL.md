# Emissão fiscal — NFC-e (modelo 65)

## Estado: não implementado

A integração com a **Geranet** não foi construída porque a documentação da API
e as credenciais não foram fornecidas. Escrever um cliente HTTP adivinhando
endpoints produziria código que parece pronto e falha em produção — e uma nota
fiscal que "parece emitida" é pior do que nenhuma nota.

**Não há simulação.** `provedorFiscal()` devolve um provedor que recusa emitir
e explica o motivo.

## O que já está pronto

A tabela `loja.notas_fiscais` existe com tudo que a emissão precisa:

| Coluna | Para quê |
|---|---|
| `pedido_id` | **`unique`** — controle de duplicidade: uma nota por pedido |
| `provedor`, `ambiente` | separação `homologacao` / `producao` |
| `modelo` | `'65'` |
| `status` | `pendente`, `processando`, `emitida`, `erro`, `cancelada` |
| `numero`, `serie`, `chave_acesso`, `protocolo` | identificação da nota |
| `url_danfe`, `url_xml` | retorno do provedor |
| `tentativas`, `erro` | reprocessamento seguro |
| `payload_retorno` | resposta bruta, para auditoria |

A interface `ProvedorFiscal` está em `src/lib/fiscal/index.ts`.

## Para implementar

Preciso de:

1. Documentação da API da Geranet — endpoints, autenticação, formato do
   payload e dos erros.
2. Credenciais de **homologação** (produção só depois dos testes).
3. Dados fiscais do estabelecimento: CNPJ, inscrição estadual, regime
   tributário, série e numeração da NFC-e, CSC/token do estado (RS).
4. Dados fiscais **por produto**: NCM, CFOP, CST/CSOSN, alíquotas. Isso não
   existe no cadastro atual — o catálogo teria colunas novas.

O item 4 costuma ser o mais demorado: cada item do cardápio precisa da
classificação fiscal correta, e isso normalmente vem do contador.

## Passos previstos

1. Estender `loja.produtos` com os campos fiscais.
2. Escrever `ProvedorGeranet implements ProvedorFiscal`.
3. Rota `POST /api/fiscal/emitir`, protegida por `ADMIN_TOKEN`, disparada
   depois da confirmação do pagamento.
4. Fila de reprocessamento para falhas transitórias, usando `tentativas`.
5. Homologar com a SEFAZ-RS antes de ligar em produção.

Enquanto isso não acontece, o sistema opera normalmente — apenas não emite
nota. `FISCAL_PROVIDER` fica em `nenhum`.
