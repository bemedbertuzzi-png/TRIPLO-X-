"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCarrinho } from "./carrinho-contexto";
import { formatarBRL } from "@/lib/dinheiro";
import { todosOsProdutos, type Catalogo } from "@/lib/catalogo";
import type { Modalidade } from "@/lib/tipos";

const CHAVE_DADOS = "triploxis.cliente.v1";
const CHAVE_IDEM = "triploxis.idempotencia.v1";

interface DadosCliente {
  nome: string;
  telefone: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairroId: string;
  referencia: string;
}

const VAZIO: DadosCliente = {
  nome: "",
  telefone: "",
  logradouro: "",
  numero: "",
  complemento: "",
  bairroId: "",
  referencia: "",
};

function formatarTelefone(valor: string): string {
  const d = valor.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function FormularioCheckout({ catalogo }: { catalogo: Catalogo }) {
  const router = useRouter();
  const { itens, pronto, limpar } = useCarrinho();

  const [modalidade, setModalidade] = useState<Modalidade>(
    catalogo.config.aceita_entrega ? "entrega" : "retirada",
  );
  const [dados, setDados] = useState<DadosCliente>(VAZIO);
  const [observacao, setObservacao] = useState("");
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const chaveIdempotencia = useRef<string | null>(null);

  // relembra os dados do cliente entre pedidos (so neste navegador)
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE_DADOS);
      if (bruto) setDados({ ...VAZIO, ...(JSON.parse(bruto) as Partial<DadosCliente>) });
    } catch {
      /* ignora armazenamento indisponivel */
    }
  }, []);

  const produtosPorId = useMemo(() => {
    const mapa = new Map(todosOsProdutos(catalogo).map((p) => [p.id, p]));
    return mapa;
  }, [catalogo]);

  const subtotal = useMemo(
    () =>
      itens.reduce((total, item) => {
        const produto = produtosPorId.get(item.produtoId);
        if (!produto) return total;
        const extras = produto.grupos
          .flatMap((g) => g.opcoes)
          .filter((o) => item.opcaoIds.includes(o.id))
          .reduce((t, o) => t + o.preco_centavos, 0);
        return total + (produto.preco_centavos + extras) * item.quantidade;
      }, 0),
    [itens, produtosPorId],
  );

  const bairroSelecionado = catalogo.bairros.find((b) => b.id === dados.bairroId);
  const taxa = modalidade === "entrega" ? (bairroSelecionado?.taxa_centavos ?? 0) : 0;
  const total = subtotal + taxa;

  const abaixoDoMinimo =
    catalogo.config.pedido_minimo_centavos > 0 &&
    subtotal < catalogo.config.pedido_minimo_centavos;

  function validar(): boolean {
    const novos: Record<string, string> = {};
    if (dados.nome.trim().length < 2) novos["nome"] = "Informe seu nome.";
    if (dados.telefone.replace(/\D/g, "").length < 10) {
      novos["telefone"] = "Informe o telefone com DDD.";
    }
    if (modalidade === "entrega") {
      if (dados.logradouro.trim().length < 3) novos["logradouro"] = "Informe a rua.";
      if (dados.numero.trim().length < 1) novos["numero"] = "Informe o número.";
      if (!dados.bairroId) novos["bairroId"] = "Selecione o bairro.";
    }
    setErros(novos);
    return Object.keys(novos).length === 0;
  }

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErroGeral(null);
    if (!validar()) return;

    setEnviando(true);
    try {
      window.localStorage.setItem(CHAVE_DADOS, JSON.stringify(dados));
    } catch {
      /* ignora */
    }

    // a mesma chave e reusada em retentativas: se a primeira chamada chegou a
    // criar o pedido, a segunda devolve o mesmo em vez de duplicar
    if (!chaveIdempotencia.current) {
      const nova =
        globalThis.crypto?.randomUUID?.() ?? `idem-${Date.now()}-${Math.random()}`;
      chaveIdempotencia.current = nova;
      try {
        window.sessionStorage.setItem(CHAVE_IDEM, nova);
      } catch {
        /* ignora */
      }
    }

    try {
      const resposta = await fetch("/api/pedidos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modalidade,
          cliente: { nome: dados.nome.trim(), telefone: dados.telefone },
          endereco:
            modalidade === "entrega"
              ? {
                  logradouro: dados.logradouro.trim(),
                  numero: dados.numero.trim(),
                  complemento: dados.complemento.trim() || undefined,
                  bairro_id: dados.bairroId,
                  referencia: dados.referencia.trim() || undefined,
                }
              : undefined,
          observacao: observacao.trim() || undefined,
          itens: itens.map((i) => ({
            produto_id: i.produtoId,
            quantidade: i.quantidade,
            opcao_ids: i.opcaoIds,
            observacao: i.observacao || undefined,
          })),
          idempotency_key: chaveIdempotencia.current,
        }),
      });

      const corpo = await resposta.json();

      if (!resposta.ok) {
        if (corpo?.erro?.campos) setErros(corpo.erro.campos);
        setErroGeral(corpo?.erro?.mensagem ?? "Não foi possível enviar o pedido.");
        setEnviando(false);
        return;
      }

      limpar();
      try {
        window.sessionStorage.removeItem(CHAVE_IDEM);
      } catch {
        /* ignora */
      }
      router.push(
        `/pedido/${corpo.numero_publico}?token=${corpo.token_acompanhamento}`,
      );
    } catch {
      setErroGeral(
        "Falha de conexão. Verifique sua internet e tente novamente — " +
          "seu pedido não será duplicado.",
      );
      setEnviando(false);
    }
  }

  if (!pronto) return <p className="mt-6 text-(--color-tinta-suave)">Carregando…</p>;

  if (itens.length === 0) {
    return (
      <p className="mt-6 text-(--color-tinta-suave)">
        Seu carrinho está vazio.{" "}
        <a href="/" className="underline">
          Ver cardápio
        </a>
        .
      </p>
    );
  }

  return (
    <form onSubmit={enviar} className="mt-5 space-y-6" noValidate>
      {(catalogo.config.aceita_entrega && catalogo.config.aceita_retirada) ? (
        <fieldset>
          <legend className="mb-2 font-semibold">Como você quer receber?</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["entrega", "retirada"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModalidade(m)}
                aria-pressed={modalidade === m}
                className={[
                  "rounded-xl border px-4 py-3 font-semibold transition",
                  modalidade === m
                    ? "border-(--color-marca-amarelo) bg-(--color-marca-amarelo)/10"
                    : "border-(--color-borda) text-(--color-tinta-suave)",
                ].join(" ")}
              >
                {m === "entrega" ? "Entrega" : "Retirada"}
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="space-y-4">
        <Campo
          id="nome"
          rotulo="Nome"
          valor={dados.nome}
          erro={erros["nome"]}
          aoMudar={(v) => setDados((d) => ({ ...d, nome: v }))}
          autoComplete="name"
        />
        <Campo
          id="telefone"
          rotulo="WhatsApp / Telefone"
          valor={dados.telefone}
          erro={erros["telefone"]}
          aoMudar={(v) => setDados((d) => ({ ...d, telefone: formatarTelefone(v) }))}
          inputMode="tel"
          autoComplete="tel"
          placeholder="(51) 99999-9999"
        />
      </div>

      {modalidade === "entrega" ? (
        <div className="space-y-4">
          <h3 className="font-semibold">Endereço de entrega</h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Campo
                id="logradouro"
                rotulo="Rua"
                valor={dados.logradouro}
                erro={erros["logradouro"]}
                aoMudar={(v) => setDados((d) => ({ ...d, logradouro: v }))}
                autoComplete="address-line1"
              />
            </div>
            <Campo
              id="numero"
              rotulo="Número"
              valor={dados.numero}
              erro={erros["numero"]}
              aoMudar={(v) => setDados((d) => ({ ...d, numero: v }))}
            />
          </div>

          <Campo
            id="complemento"
            rotulo="Complemento (opcional)"
            valor={dados.complemento}
            aoMudar={(v) => setDados((d) => ({ ...d, complemento: v }))}
          />

          <div>
            <label htmlFor="bairro" className="mb-1.5 block text-sm font-medium">
              Bairro
            </label>
            <select
              id="bairro"
              value={dados.bairroId}
              onChange={(e) => setDados((d) => ({ ...d, bairroId: e.target.value }))}
              aria-invalid={Boolean(erros["bairroId"])}
              className="w-full rounded-xl border border-(--color-borda) bg-(--color-superficie) px-4 py-3 outline-none focus:border-(--color-marca-amarelo)"
            >
              <option value="">Selecione…</option>
              {catalogo.bairros.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.nome}
                  {b.taxa_centavos > 0 ? ` — ${formatarBRL(b.taxa_centavos)}` : " — grátis"}
                </option>
              ))}
            </select>
            {catalogo.bairros.length === 0 ? (
              <p className="mt-1 text-sm text-(--color-alerta)">
                Nenhum bairro de entrega cadastrado. Escolha retirada.
              </p>
            ) : null}
            {erros["bairroId"] ? (
              <p role="alert" className="mt-1 text-sm text-(--color-perigo)">
                {erros["bairroId"]}
              </p>
            ) : null}
          </div>

          <Campo
            id="referencia"
            rotulo="Ponto de referência (opcional)"
            valor={dados.referencia}
            aoMudar={(v) => setDados((d) => ({ ...d, referencia: v }))}
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="obs-pedido" className="mb-1.5 block text-sm font-medium">
          Observações do pedido (opcional)
        </label>
        <textarea
          id="obs-pedido"
          rows={2}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value.slice(0, 500))}
          className="w-full resize-none rounded-xl border border-(--color-borda) bg-(--color-superficie) p-3 outline-none focus:border-(--color-marca-amarelo)"
        />
      </div>

      <section
        aria-label="Resumo do pedido"
        className="rounded-(--radius-cartao) border border-(--color-borda) bg-(--color-superficie) p-4"
      >
        <h3 className="mb-3 font-semibold">Resumo</h3>
        <ul className="space-y-1.5 text-sm">
          {itens.map((i) => (
            <li key={i.linhaId} className="flex justify-between gap-3">
              <span className="min-w-0 flex-1 truncate text-(--color-tinta-suave)">
                {i.quantidade}× {i.nome}
              </span>
              <span>{formatarBRL(i.precoEstimadoCentavos * i.quantidade)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 space-y-1 border-t border-(--color-borda) pt-3 text-sm">
          <div className="flex justify-between text-(--color-tinta-suave)">
            <span>Subtotal</span>
            <span>{formatarBRL(subtotal)}</span>
          </div>
          {modalidade === "entrega" ? (
            <div className="flex justify-between text-(--color-tinta-suave)">
              <span>Taxa de entrega</span>
              <span>{bairroSelecionado ? formatarBRL(taxa) : "—"}</span>
            </div>
          ) : null}
          <div className="flex justify-between pt-1 text-base font-bold">
            <span>Total</span>
            <span className="text-(--color-marca-amarelo)">{formatarBRL(total)}</span>
          </div>
        </div>

        <p className="mt-3 text-xs text-(--color-tinta-suave)">
          O valor final é conferido pelo nosso servidor antes do pagamento.
        </p>
      </section>

      {abaixoDoMinimo ? (
        <p role="alert" className="text-sm text-(--color-perigo)">
          Pedido mínimo de {formatarBRL(catalogo.config.pedido_minimo_centavos)}.
        </p>
      ) : null}

      {erroGeral ? (
        <p role="alert" className="text-sm text-(--color-perigo)">
          {erroGeral}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enviando || abaixoDoMinimo || !catalogo.config.loja_aberta}
        className="w-full rounded-full bg-(--color-marca-vermelho) px-6 py-4 font-bold text-white transition hover:bg-(--color-marca-vermelho-escuro) disabled:cursor-not-allowed disabled:bg-(--color-superficie-alta) disabled:text-(--color-tinta-suave)"
      >
        {enviando ? "Enviando…" : "Continuar para o pagamento"}
      </button>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  valor,
  aoMudar,
  erro,
  ...resto
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (v: string) => void;
  erro?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        {rotulo}
      </label>
      <input
        id={id}
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        aria-invalid={Boolean(erro)}
        aria-describedby={erro ? `${id}-erro` : undefined}
        className={[
          "w-full rounded-xl border bg-(--color-superficie) px-4 py-3 outline-none transition",
          erro
            ? "border-(--color-perigo)"
            : "border-(--color-borda) focus:border-(--color-marca-amarelo)",
        ].join(" ")}
        {...resto}
      />
      {erro ? (
        <p id={`${id}-erro`} role="alert" className="mt-1 text-sm text-(--color-perigo)">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
