"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import { useCarrinho } from "./carrinho-contexto";
import { ModalProduto } from "./modal-produto";
import { BarraCarrinho } from "./barra-carrinho";
import { formatarBRL } from "@/lib/dinheiro";
import type { Catalogo } from "@/lib/catalogo";
import type { Produto } from "@/lib/tipos";

function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function Cardapio({ catalogo }: { catalogo: Catalogo }) {
  const { adicionar } = useCarrinho();
  const [busca, setBusca] = useState("");
  const [categoriaAtiva, setCategoriaAtiva] = useState<string | null>(null);
  const [produtoAberto, setProdutoAberto] = useState<Produto | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const termo = normalizar(busca.trim());

  const categoriasVisiveis = useMemo(() => {
    return catalogo.categorias
      .map((categoria) => ({
        ...categoria,
        produtos: categoria.produtos.filter((produto) => {
          if (termo === "") return true;
          return (
            normalizar(produto.nome).includes(termo) ||
            normalizar(produto.descricao ?? "").includes(termo)
          );
        }),
      }))
      .filter((categoria) => {
        if (categoria.produtos.length === 0) return false;
        if (termo !== "") return true;
        return categoriaAtiva === null || categoria.id === categoriaAtiva;
      });
  }, [catalogo.categorias, termo, categoriaAtiva]);

  const semResultado = termo !== "" && categoriasVisiveis.length === 0;

  return (
    <>
      <div className="mx-auto max-w-3xl px-4 pb-32">
        <div className="sticky top-0 z-30 -mx-4 bg-(--color-fundo)/95 px-4 pt-4 pb-3 backdrop-blur">
          <label htmlFor="busca" className="sr-only">
            Buscar no cardápio
          </label>
          <input
            id="busca"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar no cardápio…"
            className="w-full rounded-full border border-(--color-borda) bg-(--color-superficie) px-5 py-3 text-base outline-none transition focus:border-(--color-marca-amarelo)"
          />

          {catalogo.categorias.length > 1 && termo === "" ? (
            <div className="rolagem-sem-barra mt-3 flex gap-2 overflow-x-auto">
              <BotaoCategoria
                ativo={categoriaAtiva === null}
                aoClicar={() => setCategoriaAtiva(null)}
              >
                Tudo
              </BotaoCategoria>
              {catalogo.categorias.map((categoria) => (
                <BotaoCategoria
                  key={categoria.id}
                  ativo={categoriaAtiva === categoria.id}
                  aoClicar={() => setCategoriaAtiva(categoria.id)}
                >
                  {categoria.nome}
                </BotaoCategoria>
              ))}
            </div>
          ) : null}
        </div>

        {!catalogo.config.loja_aberta ? (
          <p
            role="status"
            className="mt-4 rounded-xl border border-(--color-alerta)/40 bg-(--color-alerta)/10 p-4 text-sm text-(--color-alerta)"
          >
            A loja está fechada no momento. Você pode ver o cardápio, mas não é
            possível finalizar pedidos.
          </p>
        ) : null}

        {catalogo.categorias.length === 0 ? (
          <p className="mt-10 text-center text-(--color-tinta-suave)">
            O cardápio ainda não foi cadastrado.
          </p>
        ) : null}

        {semResultado ? (
          <p className="mt-10 text-center text-(--color-tinta-suave)">
            Nada encontrado para “{busca}”.
          </p>
        ) : null}

        {categoriasVisiveis.map((categoria) => (
          <section key={categoria.id} className="mt-8" aria-labelledby={`c-${categoria.id}`}>
            <h2
              id={`c-${categoria.id}`}
              className="font-[family-name:var(--fonte-display)] text-xl font-bold"
            >
              {categoria.nome}
            </h2>
            {categoria.descricao ? (
              <p className="text-sm text-(--color-tinta-suave)">{categoria.descricao}</p>
            ) : null}

            <ul className="mt-3 space-y-3">
              {categoria.produtos.map((produto) => (
                <li key={produto.id}>
                  <button
                    type="button"
                    disabled={!produto.disponivel}
                    onClick={() => setProdutoAberto(produto)}
                    className="flex w-full items-center gap-4 rounded-(--radius-cartao) border border-(--color-borda) bg-(--color-superficie) p-3 text-left transition hover:border-(--color-marca-amarelo)/60 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{produto.nome}</p>
                      {produto.descricao ? (
                        <p className="mt-0.5 line-clamp-2 text-sm text-(--color-tinta-suave)">
                          {produto.descricao}
                        </p>
                      ) : null}
                      <p className="mt-1 font-semibold text-(--color-marca-amarelo)">
                        {formatarBRL(produto.preco_centavos)}
                      </p>
                      {!produto.disponivel ? (
                        <p className="mt-1 text-xs text-(--color-perigo)">Indisponível</p>
                      ) : null}
                    </div>

                    {produto.imagem_url ? (
                      <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-(--color-superficie-alta)">
                        <Image
                          src={produto.imagem_url}
                          alt={produto.nome}
                          fill
                          sizes="80px"
                          className="object-cover"
                        />
                      </div>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {produtoAberto ? (
        <ModalProduto
          produto={produtoAberto}
          aoFechar={() => setProdutoAberto(null)}
          aoConfirmar={(item) => {
            adicionar(item);
            setProdutoAberto(null);
            setAviso(`${item.nome} adicionado ao carrinho.`);
            window.setTimeout(() => setAviso(null), 2500);
          }}
        />
      ) : null}

      {/* feedback acessivel para leitores de tela */}
      <p aria-live="polite" className="sr-only">
        {aviso}
      </p>

      <BarraCarrinho />
    </>
  );
}

function BotaoCategoria({
  ativo,
  aoClicar,
  children,
}: {
  ativo: boolean;
  aoClicar: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      aria-pressed={ativo}
      className={[
        "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition",
        ativo
          ? "bg-(--color-marca-amarelo) text-black"
          : "border border-(--color-borda) text-(--color-tinta-suave) hover:text-(--color-tinta)",
      ].join(" ")}
    >
      {children}
    </button>
  );
}
