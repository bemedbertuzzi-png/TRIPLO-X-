import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Testes sobre o cardapio oficial de verdade (dados/cardapio.json).
 *
 * Servem de rede de seguranca para edicoes futuras: um preco digitado errado,
 * um slug repetido ou um desconto que zera o item falham aqui, antes de
 * alguem rodar `npm run seed` e publicar isso para os clientes.
 */

interface Opcao {
  nome: string;
  preco_centavos: number;
}
interface Grupo {
  nome: string;
  tipo: "unico" | "multiplo";
  min_escolhas: number;
  max_escolhas: number | null;
  opcoes: Opcao[];
}
interface Produto {
  slug: string;
  nome: string;
  descricao: string | null;
  preco_centavos: number;
  grupos: Grupo[];
}
interface Categoria {
  slug: string;
  nome: string;
  produtos: Produto[];
}

const cardapio = JSON.parse(
  readFileSync(join(process.cwd(), "dados", "cardapio.json"), "utf8"),
) as { categorias: Categoria[] };

const produtos = cardapio.categorias.flatMap((c) => c.produtos);
const grupos = produtos.flatMap((p) => p.grupos.map((g) => ({ produto: p, grupo: g })));

describe("cardapio oficial", () => {
  it("tem categorias e produtos", () => {
    expect(cardapio.categorias.length).toBeGreaterThan(0);
    expect(produtos.length).toBeGreaterThan(0);
  });

  it("nao repete slug de produto nem de categoria", () => {
    const slugsProduto = produtos.map((p) => p.slug);
    const slugsCategoria = cardapio.categorias.map((c) => c.slug);
    expect(new Set(slugsProduto).size).toBe(slugsProduto.length);
    expect(new Set(slugsCategoria).size).toBe(slugsCategoria.length);
  });

  it("usa centavos inteiros e positivos em todo produto", () => {
    for (const p of produtos) {
      expect(Number.isInteger(p.preco_centavos), `${p.slug} nao e inteiro`).toBe(true);
      expect(p.preco_centavos, `${p.slug} com preco invalido`).toBeGreaterThan(0);
    }
  });

  it("nenhuma combinação de opções zera ou inverte o preço do item", () => {
    for (const p of produtos) {
      // pior caso: todo desconto aplicado de uma vez
      const piorCaso = p.grupos.reduce((total, g) => {
        const descontos = g.opcoes
          .map((o) => o.preco_centavos)
          .filter((v) => v < 0);
        if (descontos.length === 0) return total;
        // grupo unico aplica no maximo um desconto; multiplo poderia somar
        return (
          total +
          (g.tipo === "unico"
            ? Math.min(...descontos)
            : descontos.reduce((a, b) => a + b, 0))
        );
      }, p.preco_centavos);

      expect(piorCaso, `${p.slug} pode chegar a preço <= 0`).toBeGreaterThan(0);
    }
  });

  it("todo grupo obrigatório tem opção suficiente para ser satisfeito", () => {
    for (const { produto, grupo } of grupos) {
      expect(
        grupo.opcoes.length,
        `${produto.slug} / ${grupo.nome} sem opções`,
      ).toBeGreaterThanOrEqual(grupo.min_escolhas);
      if (grupo.max_escolhas !== null) {
        expect(
          grupo.max_escolhas,
          `${produto.slug} / ${grupo.nome} com max < min`,
        ).toBeGreaterThanOrEqual(grupo.min_escolhas);
      }
    }
  });

  it("grupo de escolha única obrigatório aceita exatamente uma opção", () => {
    for (const { produto, grupo } of grupos) {
      if (grupo.tipo !== "unico" || grupo.min_escolhas === 0) continue;
      expect(grupo.min_escolhas, `${produto.slug} / ${grupo.nome}`).toBe(1);
      expect(grupo.max_escolhas, `${produto.slug} / ${grupo.nome}`).toBe(1);
    }
  });

  it("o desconto do tamanho MINI é sempre de R$ 2,00", () => {
    const tamanhos = grupos.filter(
      ({ grupo }) => grupo.nome === "Tamanho" && grupo.opcoes.some((o) => o.nome === "Mini"),
    );
    expect(tamanhos.length).toBeGreaterThan(0);

    for (const { produto, grupo } of tamanhos) {
      const mini = grupo.opcoes.find((o) => o.nome === "Mini");
      const padrao = grupo.opcoes.find((o) => o.nome === "Tradicional");
      expect(padrao?.preco_centavos, produto.slug).toBe(0);
      expect(mini?.preco_centavos, produto.slug).toBe(-200);
    }
  });

  it("nenhum produto fica sem nome legível", () => {
    for (const p of produtos) {
      expect(p.nome.trim().length, p.slug).toBeGreaterThan(1);
    }
  });
});
