import { createHmac, timingSafeEqual } from "node:crypto";
import { envServidor } from "@/lib/env";
import type { StatusPagamento } from "@/lib/tipos";
import type {
  CobrancaPix,
  EntradaCobranca,
  EventoWebhook,
  ProvedorPagamento,
  ResultadoConsulta,
} from "./tipos";

const BASE = "https://api.mercadopago.com";

function mapearStatus(status: string): StatusPagamento {
  switch (status) {
    case "approved":
      return "pago";
    case "pending":
    case "in_process":
    case "authorized":
      return "pendente";
    case "rejected":
      return "falhou";
    case "cancelled":
      return "expirado";
    case "refunded":
    case "charged_back":
      return "estornado";
    default:
      return "pendente";
  }
}

interface RespostaPagamentoMP {
  id: number | string;
  status: string;
  date_of_expiration?: string;
  point_of_interaction?: {
    transaction_data?: {
      qr_code?: string;
      qr_code_base64?: string;
    };
  };
}

/**
 * Driver Mercado Pago (Pix).
 *
 * O webhook do Mercado Pago carrega apenas o id do pagamento. O corpo nunca e
 * tratado como fonte de verdade: a assinatura e validada e, em seguida, o
 * status e relido da API antes de qualquer pedido ser marcado como pago.
 */
export class ProvedorMercadoPago implements ProvedorPagamento {
  readonly nome = "mercadopago";
  readonly confirmaAutomaticamente = true;

  private get token(): string {
    const t = envServidor.mercadoPagoAccessToken;
    if (!t) throw new Error("MERCADOPAGO_ACCESS_TOKEN nao configurado");
    return t;
  }

  async criarCobranca(entrada: EntradaCobranca): Promise<CobrancaPix> {
    const expiraEm = new Date(Date.now() + entrada.expiraEmSegundos * 1000);

    const resposta = await fetch(`${BASE}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        // idempotencia no proprio provedor: reenvio nao gera cobranca dupla
        "X-Idempotency-Key": entrada.pedidoId,
      },
      body: JSON.stringify({
        transaction_amount: Number((entrada.valorCentavos / 100).toFixed(2)),
        description: entrada.descricao,
        payment_method_id: "pix",
        date_of_expiration: expiraEm.toISOString(),
        external_reference: entrada.numeroPublico,
        payer: { email: `pedido-${entrada.numeroPublico.toLowerCase()}@triploxis.local` },
      }),
    });

    if (!resposta.ok) {
      const detalhe = await resposta.text();
      throw new Error(
        `Mercado Pago recusou a cobranca (HTTP ${resposta.status}): ${detalhe.slice(0, 300)}`,
      );
    }

    const dados = (await resposta.json()) as RespostaPagamentoMP;
    const tx = dados.point_of_interaction?.transaction_data;
    if (!tx?.qr_code) {
      throw new Error("Mercado Pago nao devolveu o QR Code da cobranca");
    }

    return {
      provedor: this.nome,
      cobrancaId: String(dados.id),
      txid: entrada.numeroPublico,
      qrCode: tx.qr_code,
      qrCodeImagem: tx.qr_code_base64
        ? `data:image/png;base64,${tx.qr_code_base64}`
        : null,
      expiraEm: dados.date_of_expiration ? new Date(dados.date_of_expiration) : expiraEm,
    };
  }

  async consultarCobranca(cobrancaId: string): Promise<ResultadoConsulta> {
    const resposta = await fetch(`${BASE}/v1/payments/${cobrancaId}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!resposta.ok) {
      throw new Error(`Falha ao consultar pagamento (HTTP ${resposta.status})`);
    }
    const dados = (await resposta.json()) as RespostaPagamentoMP;
    return { status: mapearStatus(dados.status), bruto: dados };
  }

  async interpretarWebhook(
    corpoBruto: string,
    cabecalhos: Headers,
  ): Promise<EventoWebhook | null> {
    const segredo = envServidor.mercadoPagoWebhookSecret;
    if (!segredo) throw new Error("MERCADOPAGO_WEBHOOK_SECRET nao configurado");

    let corpo: { data?: { id?: string }; id?: string; type?: string };
    try {
      corpo = JSON.parse(corpoBruto);
    } catch {
      return null;
    }

    const idPagamento = corpo.data?.id ?? corpo.id;
    if (!idPagamento) return null;

    // Assinatura: x-signature traz "ts=...,v1=..."
    const assinatura = cabecalhos.get("x-signature");
    const requestId = cabecalhos.get("x-request-id") ?? "";
    if (!assinatura) return null;

    const partes = Object.fromEntries(
      assinatura.split(",").map((p) => {
        const [k, v] = p.split("=");
        return [k?.trim() ?? "", v?.trim() ?? ""];
      }),
    );
    const ts = partes["ts"];
    const v1 = partes["v1"];
    if (!ts || !v1) return null;

    const manifesto = `id:${idPagamento};request-id:${requestId};ts:${ts};`;
    const esperado = createHmac("sha256", segredo).update(manifesto).digest("hex");

    const a = Buffer.from(esperado, "hex");
    const b = Buffer.from(v1, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

    // Assinatura valida: relemos o status na API, nunca confiamos no corpo.
    const consulta = await this.consultarCobranca(String(idPagamento));

    return {
      eventoId: `${idPagamento}:${ts}`,
      cobrancaId: String(idPagamento),
      status: consulta.status,
      bruto: consulta.bruto,
    };
  }
}
