"use client";

import Link from "next/link";
import { useCarrinho } from "./carrinho-contexto";
import { formatarBRL } from "@/lib/dinheiro";

/** Barra fixa no rodape com o resumo do carrinho. Some quando vazio. */
export function BarraCarrinho({ href = "/carrinho" }: { href?: string }) {
  const { quantidadeTotal, subtotalEstimadoCentavos, pronto } = useCarrinho();

  if (!pronto || quantidadeTotal === 0) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-(--color-borda) bg-(--color-superficie)/95 p-3 backdrop-blur">
      <Link
        href={href}
        className="mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-full bg-(--color-marca-vermelho) px-5 py-3 font-bold text-white transition hover:bg-(--color-marca-vermelho-escuro) active:scale-[0.99]"
      >
        <span className="flex items-center gap-2">
          <span className="grid size-6 place-items-center rounded-full bg-white/20 text-sm">
            {quantidadeTotal}
          </span>
          Ver carrinho
        </span>
        <span>{formatarBRL(subtotalEstimadoCentavos)}</span>
      </Link>
    </div>
  );
}
