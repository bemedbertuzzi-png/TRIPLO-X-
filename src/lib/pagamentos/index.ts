import "server-only";
import { ehProducao, envServidor } from "@/lib/env";
import { ProvedorDev } from "./dev";
import { ProvedorMercadoPago } from "./mercadopago";
import type { ProvedorPagamento } from "./tipos";

export * from "./tipos";

/**
 * Seleciona o driver de pagamento pela variavel PAGAMENTO_PROVIDER.
 *
 * Barreira de seguranca: um driver que nao confirma pagamento sozinho jamais
 * roda em producao. Isso impede que a loja va ao ar aceitando pedidos que
 * ninguem consegue confirmar.
 */
export function provedorPagamento(): ProvedorPagamento {
  const nome = envServidor.pagamentoProvider.toLowerCase();

  let provedor: ProvedorPagamento;
  switch (nome) {
    case "mercadopago":
      provedor = new ProvedorMercadoPago();
      break;
    case "dev":
      provedor = new ProvedorDev();
      break;
    default:
      throw new Error(
        `PAGAMENTO_PROVIDER desconhecido: "${nome}". Use "dev" ou "mercadopago".`,
      );
  }

  if (ehProducao && !provedor.confirmaAutomaticamente) {
    throw new Error(
      `O driver de pagamento "${provedor.nome}" nao confirma pagamentos ` +
        "automaticamente e nao pode ser usado em producao. " +
        "Configure um provedor Pix real em PAGAMENTO_PROVIDER.",
    );
  }

  return provedor;
}
