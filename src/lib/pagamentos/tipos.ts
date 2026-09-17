import type { StatusPagamento } from "@/lib/tipos";

export interface EntradaCobranca {
  pedidoId: string;
  numeroPublico: string;
  valorCentavos: number;
  descricao: string;
  expiraEmSegundos: number;
  clienteNome: string;
}

export interface CobrancaPix {
  provedor: string;
  /** id da cobranca no provedor; usado para consultar e casar webhooks */
  cobrancaId: string;
  txid: string | null;
  /** payload "copia e cola" */
  qrCode: string;
  /** imagem do QR Code como data URL */
  qrCodeImagem: string | null;
  expiraEm: Date;
}

export interface ResultadoConsulta {
  status: StatusPagamento;
  bruto?: unknown;
}

export interface EventoWebhook {
  /** id unico do evento, usado para idempotencia */
  eventoId: string;
  cobrancaId: string;
  status: StatusPagamento;
  bruto: unknown;
}

export interface ProvedorPagamento {
  readonly nome: string;
  /**
   * true quando o provedor confirma o pagamento por conta propria
   * (webhook ou consulta). false significa que a confirmacao depende de
   * uma acao manual — valido apenas fora de producao.
   */
  readonly confirmaAutomaticamente: boolean;

  criarCobranca(entrada: EntradaCobranca): Promise<CobrancaPix>;
  consultarCobranca(cobrancaId: string): Promise<ResultadoConsulta>;
  /** Valida assinatura e devolve o evento, ou null se a requisicao for invalida. */
  interpretarWebhook(
    corpoBruto: string,
    cabecalhos: Headers,
  ): Promise<EventoWebhook | null>;
}
