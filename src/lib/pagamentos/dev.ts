import QRCode from "qrcode";
import { gerarBrCode } from "@/lib/pix/brcode";
import { envServidor } from "@/lib/env";
import type {
  CobrancaPix,
  EntradaCobranca,
  EventoWebhook,
  ProvedorPagamento,
  ResultadoConsulta,
} from "./tipos";

/**
 * Driver de DESENVOLVIMENTO.
 *
 * Gera um BR Code estatico real a partir de PIX_CHAVE — o QR Code funciona e
 * o dinheiro cai de verdade na conta —, mas o sistema NAO tem como saber que
 * foi pago, porque uma chave estatica nao produz notificacao.
 *
 * Por isso `confirmaAutomaticamente` e false e `consultarCobranca` devolve
 * sempre "pendente": nada aqui marca um pedido como pago sozinho. A
 * confirmacao exige uma acao humana explicita pelo endpoint administrativo
 * protegido. Este driver e recusado quando NODE_ENV=production.
 */
export class ProvedorDev implements ProvedorPagamento {
  readonly nome = "dev";
  readonly confirmaAutomaticamente = false;

  async criarCobranca(entrada: EntradaCobranca): Promise<CobrancaPix> {
    const txid = entrada.numeroPublico.replace(/[^A-Za-z0-9]/g, "");
    const qrCode = gerarBrCode({
      chave: envServidor.pixChave,
      valorCentavos: entrada.valorCentavos,
      beneficiario: envServidor.pixBeneficiario,
      cidade: envServidor.pixCidade,
      txid,
    });

    const qrCodeImagem = await QRCode.toDataURL(qrCode, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
    });

    return {
      provedor: this.nome,
      cobrancaId: `dev-${entrada.pedidoId}`,
      txid,
      qrCode,
      qrCodeImagem,
      expiraEm: new Date(Date.now() + entrada.expiraEmSegundos * 1000),
    };
  }

  async consultarCobranca(): Promise<ResultadoConsulta> {
    // Sem PSP nao ha como verificar. Nunca devolve "pago".
    return { status: "pendente" };
  }

  async interpretarWebhook(): Promise<EventoWebhook | null> {
    return null;
  }
}
