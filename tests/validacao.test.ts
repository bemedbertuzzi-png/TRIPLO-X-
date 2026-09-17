import { describe, expect, it } from "vitest";
import {
  errosPorCampo,
  esquemaCriarPedido,
  esquemaTelefone,
} from "@/lib/validacao";

const ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const OUTRO_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8";

function pedidoBase() {
  return {
    modalidade: "retirada" as const,
    cliente: { nome: "Maria Silva", telefone: "(51) 99999-1234" },
    itens: [{ produto_id: ID, quantidade: 2, opcao_ids: [] }],
    idempotency_key: "chave-de-teste-123",
  };
}

describe("esquemaTelefone", () => {
  it("aceita telefone com mascara e normaliza para digitos", () => {
    expect(esquemaTelefone.parse("(51) 99999-1234")).toBe("51999991234");
    expect(esquemaTelefone.parse("51 3663-1234")).toBe("5136631234");
  });

  it("rejeita telefone curto demais para ter DDD", () => {
    expect(esquemaTelefone.safeParse("99999").success).toBe(false);
  });
});

describe("esquemaCriarPedido", () => {
  it("aceita um pedido de retirada valido", () => {
    const r = esquemaCriarPedido.safeParse(pedidoBase());
    expect(r.success).toBe(true);
  });

  it("recusa carrinho vazio", () => {
    const r = esquemaCriarPedido.safeParse({ ...pedidoBase(), itens: [] });
    expect(r.success).toBe(false);
  });

  it("exige endereco quando a modalidade e entrega", () => {
    const r = esquemaCriarPedido.safeParse({
      ...pedidoBase(),
      modalidade: "entrega",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(errosPorCampo(r.error)).toHaveProperty("endereco");
    }
  });

  it("aceita entrega quando o endereco esta completo", () => {
    const r = esquemaCriarPedido.safeParse({
      ...pedidoBase(),
      modalidade: "entrega",
      endereco: {
        logradouro: "Rua Marechal Floriano",
        numero: "120",
        bairro_id: OUTRO_ID,
      },
    });
    expect(r.success).toBe(true);
  });

  it("recusa quantidade fora da faixa permitida", () => {
    for (const quantidade of [0, -1, 51]) {
      const r = esquemaCriarPedido.safeParse({
        ...pedidoBase(),
        itens: [{ produto_id: ID, quantidade, opcao_ids: [] }],
      });
      expect(r.success).toBe(false);
    }
  });

  it("recusa produto que nao seja um uuid", () => {
    const r = esquemaCriarPedido.safeParse({
      ...pedidoBase(),
      itens: [{ produto_id: "xis-salada", quantidade: 1, opcao_ids: [] }],
    });
    expect(r.success).toBe(false);
  });

  it("ignora qualquer preco enviado pelo navegador", () => {
    const r = esquemaCriarPedido.safeParse({
      ...pedidoBase(),
      itens: [
        { produto_id: ID, quantidade: 1, opcao_ids: [], preco_centavos: 1 },
      ],
    });
    expect(r.success).toBe(true);
    if (r.success) {
      // o campo nao sobrevive a validacao: o servidor busca o preco no banco
      expect(r.data.itens[0]).not.toHaveProperty("preco_centavos");
    }
  });

  it("exige chave de idempotencia para evitar pedido duplicado", () => {
    const { idempotency_key: _, ...semChave } = pedidoBase();
    expect(esquemaCriarPedido.safeParse(semChave).success).toBe(false);
  });
});

describe("errosPorCampo", () => {
  it("mapeia o primeiro erro de cada campo", () => {
    const r = esquemaCriarPedido.safeParse({
      ...pedidoBase(),
      cliente: { nome: "", telefone: "1" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const mapa = errosPorCampo(r.error);
      expect(mapa).toHaveProperty("cliente.nome");
      expect(mapa).toHaveProperty("cliente.telefone");
    }
  });
});
