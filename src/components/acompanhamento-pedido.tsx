"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { formatarBRL } from "@/lib/dinheiro";
import {
  ROTULO_STATUS_PAGAMENTO,
  ROTULO_STATUS_PEDIDO,
  type StatusPagamento,
  type StatusPedido,
} from "@/lib/tipos";

interface ItemPedido {
  nome: string;
  quantidade: number;
  total_centavos: number;
  opcoes: { nome: string }[];
  observacao: string | null;
}

interface Pedido {
  numero_publico: string;
  modalidade: "entrega" | "retirada";
  status_pedido: StatusPedido;
  status_pagamento: StatusPagamento;
  cliente_nome: string;
  subtotal_centavos: number;
  taxa_entrega_centavos: number;
  total_centavos: number;
  itens: ItemPedido[];
  pagamento: {
    status: string;
    qr_code: string | null;
    qr_code_imagem: string | null;
    expira_em: string | null;
  } | null;
}

const ETAPAS: StatusPedido[] = [
  "recebido",
  "em_preparacao",
  "pronto",
  "saiu_entrega",
  "finalizado",
];

export function AcompanhamentoPedido({
  numero,
  token,
}: {
  numero: string;
  token: string;
}) {
  const [pedido, setPedido] = useState<Pedido | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [gerandoPix, setGerandoPix] = useState(false);
  const [copiado, setCopiado] = useState(false);

  const buscar = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/pedidos/${encodeURIComponent(numero)}?token=${encodeURIComponent(token)}`,
        { cache: "no-store" },
      );
      if (!r.ok) {
        setErro(
          r.status === 404
            ? "Pedido não encontrado. Confira o link."
            : "Não foi possível carregar o pedido.",
        );
        return null;
      }
      const dados = (await r.json()) as Pedido;
      setPedido(dados);
      setErro(null);
      return dados;
    } catch {
      setErro("Falha de conexão ao consultar o pedido.");
      return null;
    } finally {
      setCarregando(false);
    }
  }, [numero, token]);

  useEffect(() => {
    void buscar();
  }, [buscar]);

  // enquanto o pagamento nao resolve, reconcilia com o provedor a cada 6s
  useEffect(() => {
    if (!pedido || pedido.status_pagamento !== "pendente") return;

    const intervalo = window.setInterval(async () => {
      try {
        await fetch("/api/pagamentos/consultar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ numero, token }),
        });
      } catch {
        /* rede instavel: tentamos de novo no proximo ciclo */
      }
      await buscar();
    }, 6000);

    return () => window.clearInterval(intervalo);
  }, [pedido, numero, token, buscar]);

  async function gerarPix() {
    setGerandoPix(true);
    setErro(null);
    try {
      const r = await fetch("/api/pagamentos/pix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ numero, token }),
      });
      const corpo = await r.json();
      if (!r.ok) {
        setErro(corpo?.erro?.mensagem ?? "Não foi possível gerar o Pix.");
      } else {
        await buscar();
      }
    } catch {
      setErro("Falha de conexão ao gerar o Pix.");
    } finally {
      setGerandoPix(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      setErro("Não foi possível copiar. Selecione o código manualmente.");
    }
  }

  if (carregando) return <p className="text-(--color-tinta-suave)">Carregando pedido…</p>;
  if (erro && !pedido)
    return (
      <p role="alert" className="text-(--color-perigo)">
        {erro}
      </p>
    );
  if (!pedido) return null;

  const pago = pedido.status_pagamento === "pago";
  const etapaAtual = ETAPAS.indexOf(pedido.status_pedido);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-(--color-tinta-suave)">Pedido</p>
        <h2 className="font-[family-name:var(--fonte-display)] text-3xl font-extrabold">
          {pedido.numero_publico}
        </h2>
        <p className="mt-1 text-(--color-tinta-suave)">
          {pedido.modalidade === "entrega" ? "Entrega" : "Retirada"} ·{" "}
          {pedido.cliente_nome}
        </p>
      </div>

      <div
        className={[
          "rounded-(--radius-cartao) border p-4",
          pago
            ? "border-(--color-sucesso)/40 bg-(--color-sucesso)/10"
            : "border-(--color-alerta)/40 bg-(--color-alerta)/10",
        ].join(" ")}
      >
        <p
          aria-live="polite"
          className={[
            "font-semibold",
            pago ? "text-(--color-sucesso)" : "text-(--color-alerta)",
          ].join(" ")}
        >
          {ROTULO_STATUS_PAGAMENTO[pedido.status_pagamento]}
        </p>
        {!pago ? (
          <p className="mt-1 text-sm text-(--color-tinta-suave)">
            Seu pedido só entra na fila da cozinha depois que o pagamento for
            confirmado.
          </p>
        ) : null}
      </div>

      {!pago && pedido.status_pagamento !== "estornado" ? (
        <section
          aria-label="Pagamento via Pix"
          className="rounded-(--radius-cartao) border border-(--color-borda) bg-(--color-superficie) p-5"
        >
          <h3 className="font-semibold">Pagar com Pix</h3>

          {pedido.pagamento?.qr_code ? (
            <div className="mt-4 space-y-4">
              {pedido.pagamento.qr_code_imagem ? (
                <div className="mx-auto w-fit rounded-xl bg-white p-3">
                  <Image
                    src={pedido.pagamento.qr_code_imagem}
                    alt="QR Code do Pix"
                    width={240}
                    height={240}
                    unoptimized
                  />
                </div>
              ) : null}

              <div>
                <p className="mb-1.5 text-sm font-medium">Pix copia e cola</p>
                <p className="break-all rounded-xl border border-(--color-borda) bg-(--color-fundo) p-3 font-mono text-xs">
                  {pedido.pagamento.qr_code}
                </p>
                <button
                  type="button"
                  onClick={() => copiar(pedido.pagamento?.qr_code ?? "")}
                  className="mt-3 w-full rounded-full bg-(--color-marca-amarelo) px-6 py-3 font-bold text-black transition hover:bg-(--color-marca-amarelo-claro)"
                >
                  {copiado ? "Código copiado!" : "Copiar código Pix"}
                </button>
              </div>

              <p className="text-center text-xs text-(--color-tinta-suave)">
                Esta tela atualiza sozinha assim que o pagamento for identificado.
              </p>
            </div>
          ) : (
            <button
              type="button"
              onClick={gerarPix}
              disabled={gerandoPix}
              className="mt-4 w-full rounded-full bg-(--color-marca-amarelo) px-6 py-3 font-bold text-black transition hover:bg-(--color-marca-amarelo-claro) disabled:opacity-60"
            >
              {gerandoPix ? "Gerando…" : "Gerar código Pix"}
            </button>
          )}

          {erro ? (
            <p role="alert" className="mt-3 text-sm text-(--color-perigo)">
              {erro}
            </p>
          ) : null}
        </section>
      ) : null}

      {pago ? (
        <section aria-label="Andamento do pedido">
          <h3 className="mb-3 font-semibold">Andamento</h3>
          <ol className="space-y-2">
            {ETAPAS.map((etapa, indice) => {
              const alcancada = etapaAtual >= indice;
              const pular = etapa === "saiu_entrega" && pedido.modalidade === "retirada";
              if (pular) return null;
              return (
                <li key={etapa} className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className={[
                      "size-3 rounded-full",
                      alcancada
                        ? "bg-(--color-marca-amarelo)"
                        : "bg-(--color-superficie-alta)",
                    ].join(" ")}
                  />
                  <span
                    className={
                      alcancada ? "font-medium" : "text-(--color-tinta-suave)"
                    }
                  >
                    {ROTULO_STATUS_PEDIDO[etapa]}
                  </span>
                </li>
              );
            })}
          </ol>
          {pedido.status_pedido === "cancelado" ? (
            <p className="mt-3 text-(--color-perigo)">Pedido cancelado.</p>
          ) : null}
        </section>
      ) : null}

      <section
        aria-label="Itens do pedido"
        className="rounded-(--radius-cartao) border border-(--color-borda) bg-(--color-superficie) p-4"
      >
        <h3 className="mb-3 font-semibold">Itens</h3>
        <ul className="space-y-2 text-sm">
          {pedido.itens.map((item, indice) => (
            <li key={indice} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1">
                <span className="text-(--color-tinta-suave)">
                  {item.quantidade}× {item.nome}
                </span>
                {item.opcoes.length > 0 ? (
                  <span className="block text-xs text-(--color-tinta-suave)">
                    {item.opcoes.map((o) => o.nome).join(", ")}
                  </span>
                ) : null}
                {item.observacao ? (
                  <span className="block text-xs italic text-(--color-tinta-suave)">
                    “{item.observacao}”
                  </span>
                ) : null}
              </span>
              <span>{formatarBRL(item.total_centavos)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1 border-t border-(--color-borda) pt-3 text-sm">
          <div className="flex justify-between text-(--color-tinta-suave)">
            <span>Subtotal</span>
            <span>{formatarBRL(pedido.subtotal_centavos)}</span>
          </div>
          {pedido.taxa_entrega_centavos > 0 ? (
            <div className="flex justify-between text-(--color-tinta-suave)">
              <span>Taxa de entrega</span>
              <span>{formatarBRL(pedido.taxa_entrega_centavos)}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1 font-bold">
            <span>Total</span>
            <span className="text-(--color-marca-amarelo)">
              {formatarBRL(pedido.total_centavos)}
            </span>
          </div>
        </div>
      </section>

      <p className="text-center text-xs text-(--color-tinta-suave)">
        Guarde este link para acompanhar seu pedido.
      </p>
    </div>
  );
}
