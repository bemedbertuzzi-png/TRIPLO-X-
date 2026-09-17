import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export function ok<T>(dados: T, status = 200) {
  return NextResponse.json(dados, { status });
}

export function erro(codigo: string, mensagem: string, status = 400) {
  return NextResponse.json({ erro: { codigo, mensagem } }, { status });
}

/**
 * Compara segredos em tempo constante. Fazemos hash antes para que segredos
 * de tamanhos diferentes nao vazem informacao pelo comprimento.
 */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido || !esperado) return false;
  const a = createHash("sha256").update(recebido).digest();
  const b = createHash("sha256").update(esperado).digest();
  return timingSafeEqual(a, b);
}

/** Le o bearer token do cabecalho Authorization. */
export function bearer(req: Request): string | null {
  const cabecalho = req.headers.get("authorization");
  if (!cabecalho?.startsWith("Bearer ")) return null;
  return cabecalho.slice(7).trim();
}

/**
 * Limitador de taxa simples, em memoria.
 *
 * Limitacao conhecida: em ambiente serverless cada instancia tem o proprio
 * contador, entao isso segura abuso casual, nao um ataque distribuido. Para
 * protecao real, colocar um limitador na borda (Vercel Firewall) ou um
 * armazenamento compartilhado.
 */
const janelas = new Map<string, { contador: number; expiraEm: number }>();

export function limitarTaxa(chave: string, limite: number, janelaMs: number): boolean {
  const agora = Date.now();
  const atual = janelas.get(chave);

  if (!atual || atual.expiraEm < agora) {
    janelas.set(chave, { contador: 1, expiraEm: agora + janelaMs });
    return true;
  }
  if (atual.contador >= limite) return false;

  atual.contador += 1;
  return true;
}

export function ipDaRequisicao(req: Request): string {
  const encaminhado = req.headers.get("x-forwarded-for");
  return encaminhado?.split(",")[0]?.trim() ?? "desconhecido";
}

/** Log sem dados sensiveis: nunca imprime telefone, endereco ou segredos. */
export function registrar(evento: string, detalhe: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ evento, ...detalhe, em: new Date().toISOString() }));
}
