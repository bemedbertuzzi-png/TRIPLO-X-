export type Modalidade = "entrega" | "retirada";

export type StatusPagamento =
  | "pendente"
  | "pago"
  | "expirado"
  | "falhou"
  | "estornado";

export type StatusPedido =
  | "recebido"
  | "em_preparacao"
  | "pronto"
  | "saiu_entrega"
  | "finalizado"
  | "cancelado";

export const ROTULO_STATUS_PEDIDO: Record<StatusPedido, string> = {
  recebido: "Recebido",
  em_preparacao: "Em preparação",
  pronto: "Pronto",
  saiu_entrega: "Saiu para entrega",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

export const ROTULO_STATUS_PAGAMENTO: Record<StatusPagamento, string> = {
  pendente: "Aguardando pagamento",
  pago: "Pago",
  expirado: "Pix expirado",
  falhou: "Pagamento não concluído",
  estornado: "Estornado",
};

export interface Opcao {
  id: string;
  nome: string;
  preco_centavos: number;
  disponivel: boolean;
  ordem: number;
}

export interface OpcaoGrupo {
  id: string;
  nome: string;
  tipo: "unico" | "multiplo";
  min_escolhas: number;
  max_escolhas: number | null;
  ordem: number;
  opcoes: Opcao[];
}

export interface Produto {
  id: string;
  categoria_id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  imagem_url: string | null;
  disponivel: boolean;
  provisorio: boolean;
  ordem: number;
  grupos: OpcaoGrupo[];
}

export interface Categoria {
  id: string;
  slug: string;
  nome: string;
  descricao: string | null;
  ordem: number;
  produtos: Produto[];
}

export interface Bairro {
  id: string;
  nome: string;
  taxa_centavos: number;
}

/** Item do carrinho como vive no navegador. Preco NUNCA e confiado no servidor. */
export interface ItemCarrinho {
  /** id local, permite dois itens do mesmo produto com opcoes diferentes */
  linhaId: string;
  produtoId: string;
  nome: string;
  imagemUrl: string | null;
  quantidade: number;
  observacao: string;
  opcaoIds: string[];
  /** apenas para exibicao otimista; o servidor recalcula tudo */
  precoEstimadoCentavos: number;
  opcoesNomes: string[];
}
