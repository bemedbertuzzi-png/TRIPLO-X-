"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { formatarBRL } from "@/lib/dinheiro";
import type { ItemCarrinho, Produto } from "@/lib/tipos";

interface Props {
  produto: Produto;
  /** quando presente, o modal edita uma linha existente do carrinho */
  itemExistente?: ItemCarrinho;
  aoFechar: () => void;
  aoConfirmar: (item: Omit<ItemCarrinho, "linhaId">) => void;
}

export function ModalProduto({ produto, itemExistente, aoFechar, aoConfirmar }: Props) {
  const [quantidade, setQuantidade] = useState(itemExistente?.quantidade ?? 1);
  const [observacao, setObservacao] = useState(itemExistente?.observacao ?? "");
  const [selecionadas, setSelecionadas] = useState<string[]>(() => {
    if (itemExistente) return itemExistente.opcaoIds;
    // grupos obrigatorios de escolha unica (ex.: "Tamanho") ja abrem com a
    // primeira opcao marcada, que e a do preco anunciado no cardapio
    return produto.grupos
      .filter((g) => g.tipo === "unico" && g.min_escolhas > 0)
      .map((g) => g.opcoes.find((o) => o.disponivel)?.id)
      .filter((id): id is string => Boolean(id));
  });
  const [erro, setErro] = useState<string | null>(null);
  const dialogo = useRef<HTMLDivElement>(null);

  // fecha com Esc e trava a rolagem do fundo
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFechar();
    };
    document.addEventListener("keydown", aoTeclar);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogo.current?.focus();
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAnterior;
    };
  }, [aoFechar]);

  const mapaOpcoes = useMemo(() => {
    const mapa = new Map<string, { nome: string; preco: number }>();
    for (const grupo of produto.grupos) {
      for (const opcao of grupo.opcoes) {
        mapa.set(opcao.id, { nome: opcao.nome, preco: opcao.preco_centavos });
      }
    }
    return mapa;
  }, [produto]);

  const precoUnitario = useMemo(() => {
    const extras = selecionadas.reduce(
      (total, id) => total + (mapaOpcoes.get(id)?.preco ?? 0),
      0,
    );
    return produto.preco_centavos + extras;
  }, [produto.preco_centavos, selecionadas, mapaOpcoes]);

  function alternar(grupoId: string, opcaoId: string, tipo: "unico" | "multiplo") {
    setErro(null);
    setSelecionadas((atuais) => {
      const grupo = produto.grupos.find((g) => g.id === grupoId);
      if (!grupo) return atuais;
      const idsDoGrupo = grupo.opcoes.map((o) => o.id);

      if (tipo === "unico") {
        const semGrupo = atuais.filter((id) => !idsDoGrupo.includes(id));
        return atuais.includes(opcaoId) ? semGrupo : [...semGrupo, opcaoId];
      }

      if (atuais.includes(opcaoId)) return atuais.filter((id) => id !== opcaoId);

      const jaEscolhidas = atuais.filter((id) => idsDoGrupo.includes(id)).length;
      if (grupo.max_escolhas !== null && jaEscolhidas >= grupo.max_escolhas) {
        setErro(`Você pode escolher no máximo ${grupo.max_escolhas} em "${grupo.nome}".`);
        return atuais;
      }
      return [...atuais, opcaoId];
    });
  }

  function confirmar() {
    // mesma regra que o servidor aplica — aqui apenas para dar retorno imediato
    for (const grupo of produto.grupos) {
      const escolhidas = grupo.opcoes.filter((o) => selecionadas.includes(o.id)).length;
      if (escolhidas < grupo.min_escolhas) {
        setErro(`Escolha ao menos ${grupo.min_escolhas} opção em "${grupo.nome}".`);
        return;
      }
    }

    aoConfirmar({
      produtoId: produto.id,
      nome: produto.nome,
      imagemUrl: produto.imagem_url,
      quantidade,
      observacao: observacao.trim(),
      opcaoIds: selecionadas,
      precoEstimadoCentavos: precoUnitario,
      opcoesNomes: selecionadas.map((id) => mapaOpcoes.get(id)?.nome ?? ""),
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center"
      onClick={aoFechar}
      role="presentation"
    >
      <div
        ref={dialogo}
        role="dialog"
        aria-modal="true"
        aria-label={produto.nome}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-(--color-superficie) shadow-2xl sm:rounded-3xl"
      >
        {produto.imagem_url ? (
          <div className="relative aspect-[16/10] w-full overflow-hidden rounded-t-3xl bg-(--color-superficie-alta)">
            <Image
              src={produto.imagem_url}
              alt={produto.nome}
              fill
              sizes="(max-width: 640px) 100vw, 512px"
              className="object-cover"
            />
          </div>
        ) : null}

        <div className="space-y-5 p-5">
          <div>
            <h2 className="font-[family-name:var(--fonte-display)] text-2xl font-bold">
              {produto.nome}
            </h2>
            {produto.descricao ? (
              <p className="mt-1 text-sm leading-relaxed text-(--color-tinta-suave)">
                {produto.descricao}
              </p>
            ) : null}
            <p className="mt-2 text-lg font-semibold text-(--color-marca-amarelo)">
              {formatarBRL(produto.preco_centavos)}
            </p>
          </div>

          {produto.grupos.map((grupo) => (
            <fieldset key={grupo.id} className="space-y-2">
              <legend className="flex w-full items-baseline justify-between gap-2">
                <span className="font-semibold">{grupo.nome}</span>
                <span className="text-xs text-(--color-tinta-suave)">
                  {grupo.min_escolhas > 0 ? "Obrigatório" : "Opcional"}
                  {grupo.max_escolhas !== null ? ` · até ${grupo.max_escolhas}` : ""}
                </span>
              </legend>

              <div className="space-y-2">
                {grupo.opcoes.map((opcao) => {
                  const marcada = selecionadas.includes(opcao.id);
                  return (
                    <label
                      key={opcao.id}
                      className={[
                        "flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition",
                        marcada
                          ? "border-(--color-marca-amarelo) bg-(--color-marca-amarelo)/10"
                          : "border-(--color-borda) hover:border-(--color-tinta-suave)",
                        opcao.disponivel ? "" : "cursor-not-allowed opacity-40",
                      ].join(" ")}
                    >
                      <input
                        type={grupo.tipo === "unico" ? "radio" : "checkbox"}
                        name={grupo.id}
                        checked={marcada}
                        disabled={!opcao.disponivel}
                        onChange={() => alternar(grupo.id, opcao.id, grupo.tipo)}
                        className="size-4 accent-(--color-marca-amarelo)"
                      />
                      <span className="flex-1 text-sm">{opcao.nome}</span>
                      {opcao.preco_centavos !== 0 ? (
                        <span className="text-sm text-(--color-tinta-suave)">
                          {opcao.preco_centavos > 0 ? "+ " : "− "}
                          {formatarBRL(Math.abs(opcao.preco_centavos))}
                        </span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div>
            <label htmlFor="obs" className="mb-2 block font-semibold">
              Observações
            </label>
            <textarea
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value.slice(0, 300))}
              rows={2}
              placeholder="Ex.: sem tomate"
              className="w-full resize-none rounded-xl border border-(--color-borda) bg-(--color-fundo) p-3 text-sm outline-none focus:border-(--color-marca-amarelo)"
            />
            <p className="mt-1 text-right text-xs text-(--color-tinta-suave)">
              {observacao.length}/300
            </p>
          </div>

          {erro ? (
            <p role="alert" className="text-sm text-(--color-perigo)">
              {erro}
            </p>
          ) : null}
        </div>

        <div className="sticky bottom-0 flex items-center gap-3 border-t border-(--color-borda) bg-(--color-superficie) p-4">
          <div className="flex items-center gap-1 rounded-full border border-(--color-borda) p-1">
            <button
              type="button"
              onClick={() => setQuantidade((q) => Math.max(1, q - 1))}
              aria-label="Diminuir quantidade"
              className="size-9 rounded-full text-lg font-bold hover:bg-(--color-superficie-alta)"
            >
              −
            </button>
            <span aria-live="polite" className="w-8 text-center font-semibold">
              {quantidade}
            </span>
            <button
              type="button"
              onClick={() => setQuantidade((q) => Math.min(50, q + 1))}
              aria-label="Aumentar quantidade"
              className="size-9 rounded-full text-lg font-bold hover:bg-(--color-superficie-alta)"
            >
              +
            </button>
          </div>

          <button
            type="button"
            onClick={confirmar}
            className="flex-1 rounded-full bg-(--color-marca-vermelho) px-5 py-3 font-bold text-white transition hover:bg-(--color-marca-vermelho-escuro) active:scale-[0.99]"
          >
            {itemExistente ? "Salvar" : "Adicionar"} ·{" "}
            {formatarBRL(precoUnitario * quantidade)}
          </button>
        </div>
      </div>
    </div>
  );
}
