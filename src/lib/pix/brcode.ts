/**
 * Gerador de payload Pix "copia e cola" (BR Code / EMV MPM),
 * conforme o Manual de Padroes para Iniciacao do Pix (Bacen).
 *
 * Usado apenas pelo driver de desenvolvimento, que monta uma cobranca
 * ESTATICA a partir de uma chave Pix. Um PSP real devolve o proprio payload.
 */

function tlv(id: string, valor: string): string {
  const tamanho = valor.length.toString().padStart(2, "0");
  return `${id}${tamanho}${valor}`;
}

/** CRC-16/CCITT-FALSE, exigido no campo 63 do BR Code. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Remove acentos e caracteres nao suportados pelo padrao. */
function normalizar(texto: string, max: number): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .trim()
    .slice(0, max)
    .toUpperCase();
}

export interface DadosBrCode {
  chave: string;
  valorCentavos: number;
  beneficiario: string;
  cidade: string;
  /** identificador da transacao; ate 25 caracteres alfanumericos */
  txid: string;
}

export function gerarBrCode(dados: DadosBrCode): string {
  if (!dados.chave) throw new Error("PIX_CHAVE nao configurada");

  const txid = normalizar(dados.txid, 25).replace(/ /g, "") || "***";
  const merchantAccount = tlv("00", "br.gov.bcb.pix") + tlv("01", dados.chave);

  const semCrc =
    tlv("00", "01") +
    tlv("26", merchantAccount) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", (dados.valorCentavos / 100).toFixed(2)) +
    tlv("58", "BR") +
    tlv("59", normalizar(dados.beneficiario, 25) || "RECEBEDOR") +
    tlv("60", normalizar(dados.cidade, 15) || "CIDADE") +
    tlv("62", tlv("05", txid)) +
    "6304";

  return semCrc + crc16(semCrc);
}
