import { describe, expect, it } from "vitest";
import { formatarBRL, reaisParaCentavos, somar } from "@/lib/dinheiro";

describe("formatarBRL", () => {
  it("formata centavos como moeda brasileira", () => {
    // usa espaco nao separavel entre simbolo e numero
    expect(formatarBRL(2500).replace(/ /g, " ")).toBe("R$ 25,00");
    expect(formatarBRL(0).replace(/ /g, " ")).toBe("R$ 0,00");
    expect(formatarBRL(123456).replace(/ /g, " ")).toBe("R$ 1.234,56");
  });
});

describe("somar", () => {
  it("soma inteiros sem erro de ponto flutuante", () => {
    // 0.1 + 0.2 em float daria 0.30000000000000004; em centavos e exato
    expect(somar(10, 20)).toBe(30);
    expect(somar(2500, 3600, 1000)).toBe(7100);
    expect(somar()).toBe(0);
  });
});

describe("reaisParaCentavos", () => {
  it("aceita virgula e ponto", () => {
    expect(reaisParaCentavos("25,00")).toBe(2500);
    expect(reaisParaCentavos("25.5")).toBe(2550);
    expect(reaisParaCentavos("R$ 42,00")).toBe(4200);
    expect(reaisParaCentavos("0,01")).toBe(1);
  });

  it("rejeita entradas invalidas em vez de devolver NaN", () => {
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos("")).toBeNull();
    expect(reaisParaCentavos("12,345")).toBeNull();
    expect(reaisParaCentavos("-5,00")).toBeNull();
  });
});
