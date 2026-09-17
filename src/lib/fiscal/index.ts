import "server-only";
import { envServidor } from "@/lib/env";

/**
 * Emissao fiscal (NFC-e modelo 65).
 *
 * ESTADO: nao implementado. A documentacao e as credenciais da Geranet ainda
 * nao foram fornecidas, entao nao existe integracao real aqui — e nao existe
 * simulacao, porque uma nota "emitida" de mentira e pior que nenhuma nota.
 *
 * A tabela `loja.notas_fiscais` ja existe com controle de duplicidade
 * (unique por pedido), contador de tentativas, registro de erro e separacao
 * de ambiente (homologacao/producao). O que falta e apenas o cliente HTTP
 * abaixo, que deve ser escrito contra a documentacao real.
 */

export interface ResultadoEmissao {
  status: "emitida" | "erro";
  numero?: string;
  serie?: string;
  chaveAcesso?: string;
  protocolo?: string;
  urlDanfe?: string;
  urlXml?: string;
  erro?: string;
  payload?: unknown;
}

export interface ProvedorFiscal {
  readonly nome: string;
  emitirNfce(pedidoId: string): Promise<ResultadoEmissao>;
}

class FiscalNaoConfigurado implements ProvedorFiscal {
  readonly nome = "nenhum";
  async emitirNfce(): Promise<ResultadoEmissao> {
    return {
      status: "erro",
      erro:
        "Emissão fiscal não configurada. Defina FISCAL_PROVIDER e as " +
        "credenciais do provedor após validar a documentação.",
    };
  }
}

export function provedorFiscal(): ProvedorFiscal {
  const nome = envServidor.fiscalProvider.toLowerCase();
  if (nome === "nenhum" || nome === "") return new FiscalNaoConfigurado();
  throw new Error(
    `FISCAL_PROVIDER "${nome}" ainda não possui implementação. ` +
      "A integração com a Geranet depende da documentação oficial.",
  );
}
