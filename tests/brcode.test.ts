import { describe, expect, it } from "vitest";
import { crc16, gerarBrCode } from "@/lib/pix/brcode";

describe("crc16 (CCITT-FALSE)", () => {
  it("bate com o vetor canonico do algoritmo", () => {
    // valor de referencia conhecido para CRC-16/CCITT-FALSE
    expect(crc16("123456789")).toBe("29B1");
  });

  it("produz sempre 4 digitos hexadecimais", () => {
    for (const entrada of ["", "a", "pix", "0".repeat(200)]) {
      expect(crc16(entrada)).toMatch(/^[0-9A-F]{4}$/);
    }
  });
});

describe("gerarBrCode", () => {
  const base = {
    chave: "teste@triploxis.com.br",
    beneficiario: "TRIPLO XIS LANCHES",
    cidade: "OSORIO",
    txid: "X260917001",
  };

  it("monta um payload com os campos obrigatorios do Pix", () => {
    const payload = gerarBrCode({ ...base, valorCentavos: 8600 });

    expect(payload.startsWith("000201")).toBe(true);
    expect(payload).toContain("br.gov.bcb.pix");
    expect(payload).toContain("teste@triploxis.com.br");
    expect(payload).toContain("5303986"); // moeda BRL
    expect(payload).toContain("5802BR"); // pais
    expect(payload).toContain("540586.00"); // valor com 2 casas
  });

  it("fecha o payload com um CRC valido sobre o proprio conteudo", () => {
    const payload = gerarBrCode({ ...base, valorCentavos: 2500 });
    const semCrc = payload.slice(0, -4);
    const crcInformado = payload.slice(-4);

    expect(semCrc.endsWith("6304")).toBe(true);
    expect(crc16(semCrc)).toBe(crcInformado);
  });

  it("remove acentos e simbolos do beneficiario e da cidade", () => {
    const payload = gerarBrCode({
      ...base,
      beneficiario: "Lanchonete Ação & Cia",
      cidade: "São Paulo",
      valorCentavos: 1000,
    });

    expect(payload).toContain("LANCHONETE ACAO  CIA");
    expect(payload).toContain("SAO PAULO");
  });

  it("recusa gerar cobranca sem chave configurada", () => {
    expect(() => gerarBrCode({ ...base, chave: "", valorCentavos: 100 })).toThrow(
      /PIX_CHAVE/,
    );
  });

  it("reflete o valor no payload, centavo a centavo", () => {
    // campo 54 = valor, precedido pelo proprio comprimento
    expect(gerarBrCode({ ...base, valorCentavos: 1 })).toContain("54040.01");
    expect(gerarBrCode({ ...base, valorCentavos: 123456 })).toContain("54071234.56");
  });
});
