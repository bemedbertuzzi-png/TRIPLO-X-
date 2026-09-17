/**
 * Dinheiro e sempre representado em centavos (inteiro).
 * Nunca usamos float para somar valores monetarios.
 */

export function formatarBRL(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function somar(...valores: number[]): number {
  return valores.reduce((total, v) => total + v, 0);
}

/** Converte "12,50" ou "12.50" para 1250. Retorna null se invalido. */
export function reaisParaCentavos(texto: string): number | null {
  const limpo = texto.replace(/\s|R\$/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(limpo)) return null;
  return Math.round(Number(limpo) * 100);
}
