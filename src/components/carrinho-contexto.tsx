"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ItemCarrinho } from "@/lib/tipos";

const CHAVE = "triploxis.carrinho.v1";
/** Carrinho antigo demais provavelmente tem preco desatualizado. */
const VALIDADE_MS = 1000 * 60 * 60 * 12;

interface ArmazenamentoCarrinho {
  salvoEm: number;
  itens: ItemCarrinho[];
}

interface ContextoCarrinho {
  itens: ItemCarrinho[];
  /** false ate a leitura do localStorage terminar — evita piscar carrinho vazio */
  pronto: boolean;
  quantidadeTotal: number;
  subtotalEstimadoCentavos: number;
  adicionar: (item: Omit<ItemCarrinho, "linhaId">) => void;
  atualizarQuantidade: (linhaId: string, quantidade: number) => void;
  remover: (linhaId: string) => void;
  substituir: (linhaId: string, item: Omit<ItemCarrinho, "linhaId">) => void;
  limpar: () => void;
}

const Contexto = createContext<ContextoCarrinho | null>(null);

function novaLinhaId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `linha-${Date.now()}-${Math.random()}`;
}

/** Duas linhas se fundem quando sao o mesmo produto com as mesmas opcoes e obs. */
function mesmaConfiguracao(a: Omit<ItemCarrinho, "linhaId">, b: ItemCarrinho): boolean {
  return (
    a.produtoId === b.produtoId &&
    a.observacao.trim() === b.observacao.trim() &&
    a.opcaoIds.length === b.opcaoIds.length &&
    [...a.opcaoIds].sort().join() === [...b.opcaoIds].sort().join()
  );
}

export function CarrinhoProvider({ children }: { children: React.ReactNode }) {
  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [pronto, setPronto] = useState(false);

  // carrega uma unica vez, no cliente
  useEffect(() => {
    try {
      const bruto = window.localStorage.getItem(CHAVE);
      if (bruto) {
        const dados = JSON.parse(bruto) as ArmazenamentoCarrinho;
        const expirado = Date.now() - (dados.salvoEm ?? 0) > VALIDADE_MS;
        if (!expirado && Array.isArray(dados.itens)) setItens(dados.itens);
      }
    } catch {
      // localStorage indisponivel ou corrompido: seguimos com carrinho vazio
    }
    setPronto(true);
  }, []);

  // persiste a cada mudanca, mas nunca antes de ter carregado
  useEffect(() => {
    if (!pronto) return;
    try {
      const dados: ArmazenamentoCarrinho = { salvoEm: Date.now(), itens };
      window.localStorage.setItem(CHAVE, JSON.stringify(dados));
    } catch {
      // modo privado / cota cheia: o carrinho segue funcionando em memoria
    }
  }, [itens, pronto]);

  const adicionar = useCallback((item: Omit<ItemCarrinho, "linhaId">) => {
    setItens((atuais) => {
      const indice = atuais.findIndex((i) => mesmaConfiguracao(item, i));
      if (indice >= 0) {
        const copia = [...atuais];
        const alvo = copia[indice];
        if (alvo) {
          copia[indice] = {
            ...alvo,
            quantidade: Math.min(50, alvo.quantidade + item.quantidade),
          };
        }
        return copia;
      }
      return [...atuais, { ...item, linhaId: novaLinhaId() }];
    });
  }, []);

  const atualizarQuantidade = useCallback((linhaId: string, quantidade: number) => {
    setItens((atuais) =>
      quantidade <= 0
        ? atuais.filter((i) => i.linhaId !== linhaId)
        : atuais.map((i) =>
            i.linhaId === linhaId ? { ...i, quantidade: Math.min(50, quantidade) } : i,
          ),
    );
  }, []);

  const remover = useCallback((linhaId: string) => {
    setItens((atuais) => atuais.filter((i) => i.linhaId !== linhaId));
  }, []);

  const substituir = useCallback(
    (linhaId: string, item: Omit<ItemCarrinho, "linhaId">) => {
      setItens((atuais) =>
        atuais.map((i) => (i.linhaId === linhaId ? { ...item, linhaId } : i)),
      );
    },
    [],
  );

  const limpar = useCallback(() => setItens([]), []);

  const valor = useMemo<ContextoCarrinho>(
    () => ({
      itens,
      pronto,
      quantidadeTotal: itens.reduce((t, i) => t + i.quantidade, 0),
      subtotalEstimadoCentavos: itens.reduce(
        (t, i) => t + i.precoEstimadoCentavos * i.quantidade,
        0,
      ),
      adicionar,
      atualizarQuantidade,
      remover,
      substituir,
      limpar,
    }),
    [itens, pronto, adicionar, atualizarQuantidade, remover, substituir, limpar],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useCarrinho(): ContextoCarrinho {
  const contexto = useContext(Contexto);
  if (!contexto) {
    throw new Error("useCarrinho precisa estar dentro de <CarrinhoProvider>");
  }
  return contexto;
}
