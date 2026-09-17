import { supabasePublico } from "@/lib/supabase/publico";
import type { Bairro, Categoria } from "@/lib/tipos";

export interface ConfigLoja {
  loja_aberta: boolean;
  pedido_minimo_centavos: number;
  taxa_entrega_padrao_centavos: number;
  aceita_entrega: boolean;
  aceita_retirada: boolean;
  nome_loja: string;
  cidade: string;
}

export interface Catalogo {
  categorias: Categoria[];
  bairros: Bairro[];
  config: ConfigLoja;
}

const CONFIG_PADRAO: ConfigLoja = {
  loja_aberta: false,
  pedido_minimo_centavos: 0,
  taxa_entrega_padrao_centavos: 0,
  aceita_entrega: true,
  aceita_retirada: true,
  nome_loja: "Triplo Xis Lanches",
  cidade: "Osório/RS",
};

/**
 * Carrega o cardapio.
 *
 * Em caso de falha devolvemos um catalogo vazio com a loja FECHADA, em vez de
 * uma pagina quebrada: e melhor dizer "indisponivel" do que aceitar pedido
 * sem saber o preco.
 */
export async function carregarCatalogo(): Promise<Catalogo> {
  let data: unknown = null;

  try {
    const resposta = await supabasePublico().rpc("loja_catalogo");
    if (resposta.error) throw resposta.error;
    data = resposta.data;
  } catch {
    // banco indisponivel ou aplicacao sem configuracao: nao derrubamos a
    // pagina, mas tambem nao deixamos ninguem pedir sem preco conhecido
    return { categorias: [], bairros: [], config: CONFIG_PADRAO };
  }

  if (!data) {
    return { categorias: [], bairros: [], config: CONFIG_PADRAO };
  }

  const bruto = data as {
    categorias?: Categoria[];
    bairros?: Bairro[];
    config?: Partial<ConfigLoja>;
  };

  return {
    categorias: bruto.categorias ?? [],
    bairros: bruto.bairros ?? [],
    config: { ...CONFIG_PADRAO, loja_aberta: true, ...bruto.config },
  };
}

export function todosOsProdutos(catalogo: Catalogo) {
  return catalogo.categorias.flatMap((c) =>
    c.produtos.map((p) => ({ ...p, categoriaNome: c.nome })),
  );
}
