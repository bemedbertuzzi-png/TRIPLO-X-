"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useCarrinho } from "./carrinho-contexto";
import { ModalProduto } from "./modal-produto";
import { formatarBRL } from "@/lib/dinheiro";
import { todosOsProdutos, type Catalogo } from "@/lib/catalogo";
import type { ItemCarrinho, Produto } from "@/lib/tipos";

interface Problema {
  linhaId: string;
  mensagem: string;
  grave: boolean;
}

export function ConteudoCarrinho({ catalogo }: { catalogo: Catalogo }) {
  const { itens, pronto, atualizarQuantidade, remover, substituir } = useCarrinho();
  const [editando, setEditando] = useState<{ produto: Produto; item: ItemCarrinho } | null>(
    null,
  );

  const produtosPorId = useMemo(() => {
    const mapa = new Map<string, Produto>();
    for (const p of todosOsProdutos(catalogo)) mapa.set(p.id, p);
    return mapa;
  }, [catalogo]);

  /**
   * Confere o carrinho contra o cardapio atual antes de deixar seguir.
   * O servidor revalida tudo de novo, mas avisar aqui evita o cliente
   * chegar no checkout e tomar um erro seco.
   */
  const problemas = useMemo<Problema[]>(() => {
    const lista: Problema[] = [];
    for (const item of itens) {
      const produto = produtosPorId.get(item.produtoId);
      if (!produto) {
        lista.push({
          linhaId: item.linhaId,
          mensagem: "Este item saiu do cardápio.",
          grave: true,
        });
        continue;
      }
      if (!produto.disponivel) {
        lista.push({
          linhaId: item.linhaId,
          mensagem: "Item indisponível no momento.",
          grave: true,
        });
        continue;
      }

      const extras = produto.grupos
        .flatMap((g) => g.opcoes)
        .filter((o) => item.opcaoIds.includes(o.id));

      if (extras.length !== item.opcaoIds.length) {
        lista.push({
          linhaId: item.linhaId,
          mensagem: "Alguma personalização mudou. Revise o item.",
          grave: true,
        });
        continue;
      }

      const precoAtual =
        produto.preco_centavos + extras.reduce((t, o) => t + o.preco_centavos, 0);

      if (precoAtual !== item.precoEstimadoCentavos) {
        lista.push({
          linhaId: item.linhaId,
          mensagem: `O preço mudou para ${formatarBRL(precoAtual)}.`,
          grave: false,
        });
      }
    }
    return lista;
  }, [itens, produtosPorId]);

  const temProblemaGrave = problemas.some((p) => p.grave);

  // subtotal calculado com os precos ATUAIS do cardapio, nao com os guardados
  const subtotal = useMemo(() => {
    return itens.reduce((total, item) => {
      const produto = produtosPorId.get(item.produtoId);
      if (!produto) return total;
      const extras = produto.grupos
        .flatMap((g) => g.opcoes)
        .filter((o) => item.opcaoIds.includes(o.id))
        .reduce((t, o) => t + o.preco_centavos, 0);
      return total + (produto.preco_centavos + extras) * item.quantidade;
    }, 0);
  }, [itens, produtosPorId]);

  if (!pronto) {
    return <p className="mt-6 text-(--color-tinta-suave)">Carregando…</p>;
  }

  if (itens.length === 0) {
    return (
      <div className="mt-10 text-center">
        <p className="text-(--color-tinta-suave)">Seu carrinho está vazio.</p>
        <Link
          href="/"
          className="mt-4 inline-block rounded-full bg-(--color-marca-amarelo) px-6 py-3 font-bold text-black"
        >
          Ver cardápio
        </Link>
      </div>
    );
  }

  return (
    <>
      <ul className="mt-5 space-y-3">
        {itens.map((item) => {
          const problema = problemas.find((p) => p.linhaId === item.linhaId);
          const produto = produtosPorId.get(item.produtoId);

          return (
            <li
              key={item.linhaId}
              className={[
                "rounded-(--radius-cartao) border bg-(--color-superficie) p-4",
                problema?.grave
                  ? "border-(--color-perigo)/60"
                  : "border-(--color-borda)",
              ].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{item.nome}</p>
                  {item.opcoesNomes.length > 0 ? (
                    <p className="mt-0.5 text-sm text-(--color-tinta-suave)">
                      {item.opcoesNomes.join(", ")}
                    </p>
                  ) : null}
                  {item.observacao ? (
                    <p className="mt-0.5 text-sm italic text-(--color-tinta-suave)">
                      “{item.observacao}”
                    </p>
                  ) : null}
                </div>
                <p className="shrink-0 font-semibold text-(--color-marca-amarelo)">
                  {formatarBRL(item.precoEstimadoCentavos * item.quantidade)}
                </p>
              </div>

              {problema ? (
                <p
                  role="alert"
                  className={[
                    "mt-2 text-sm",
                    problema.grave
                      ? "text-(--color-perigo)"
                      : "text-(--color-alerta)",
                  ].join(" ")}
                >
                  {problema.mensagem}
                </p>
              ) : null}

              <div className="mt-3 flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-full border border-(--color-borda) p-1">
                  <button
                    type="button"
                    aria-label={`Diminuir ${item.nome}`}
                    onClick={() => atualizarQuantidade(item.linhaId, item.quantidade - 1)}
                    className="size-8 rounded-full font-bold hover:bg-(--color-superficie-alta)"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-semibold">
                    {item.quantidade}
                  </span>
                  <button
                    type="button"
                    aria-label={`Aumentar ${item.nome}`}
                    onClick={() => atualizarQuantidade(item.linhaId, item.quantidade + 1)}
                    className="size-8 rounded-full font-bold hover:bg-(--color-superficie-alta)"
                  >
                    +
                  </button>
                </div>

                {produto ? (
                  <button
                    type="button"
                    onClick={() => setEditando({ produto, item })}
                    className="rounded-full border border-(--color-borda) px-4 py-2 text-sm hover:border-(--color-tinta-suave)"
                  >
                    Editar
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => remover(item.linhaId)}
                  className="ml-auto text-sm text-(--color-tinta-suave) hover:text-(--color-perigo)"
                >
                  Remover
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 rounded-(--radius-cartao) border border-(--color-borda) bg-(--color-superficie) p-4">
        <div className="flex justify-between text-sm text-(--color-tinta-suave)">
          <span>Subtotal</span>
          <span>{formatarBRL(subtotal)}</span>
        </div>
        <p className="mt-2 text-xs text-(--color-tinta-suave)">
          A taxa de entrega é calculada no próximo passo, conforme o bairro.
        </p>
      </div>

      {temProblemaGrave ? (
        <p role="alert" className="mt-4 text-sm text-(--color-perigo)">
          Ajuste os itens marcados antes de continuar.
        </p>
      ) : null}

      <Link
        href={temProblemaGrave || !catalogo.config.loja_aberta ? "#" : "/checkout"}
        aria-disabled={temProblemaGrave || !catalogo.config.loja_aberta}
        className={[
          "mt-4 block rounded-full px-6 py-4 text-center font-bold transition",
          temProblemaGrave || !catalogo.config.loja_aberta
            ? "pointer-events-none bg-(--color-superficie-alta) text-(--color-tinta-suave)"
            : "bg-(--color-marca-vermelho) text-white hover:bg-(--color-marca-vermelho-escuro)",
        ].join(" ")}
      >
        {catalogo.config.loja_aberta ? "Ir para o checkout" : "Loja fechada"}
      </Link>

      {editando ? (
        <ModalProduto
          produto={editando.produto}
          itemExistente={editando.item}
          aoFechar={() => setEditando(null)}
          aoConfirmar={(novo) => {
            substituir(editando.item.linhaId, novo);
            setEditando(null);
          }}
        />
      ) : null}
    </>
  );
}
