/**
 * Carrega o cardapio oficial no banco.
 *
 *   1. copie dados/cardapio.exemplo.json para dados/cardapio.json
 *   2. preencha com os dados reais (precos em centavos)
 *   3. npm run seed
 *
 * O script e idempotente: usa os `slug` como chave, entao rodar de novo
 * atualiza os itens existentes em vez de duplicar. Produtos que sumirem do
 * arquivo sao DESATIVADOS (ativo = false), nunca apagados — assim o historico
 * de pedidos antigos continua intacto.
 *
 * Precisa de SUPABASE_SERVICE_ROLE_KEY: mexe no catalogo, nao e operacao publica.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

interface OpcaoArquivo {
  nome: string;
  preco_centavos: number;
}
interface GrupoArquivo {
  nome: string;
  tipo: "unico" | "multiplo";
  min_escolhas: number;
  max_escolhas: number | null;
  opcoes: OpcaoArquivo[];
}
interface ProdutoArquivo {
  slug: string;
  nome: string;
  descricao?: string | null;
  preco_centavos: number;
  imagem_url?: string | null;
  grupos?: GrupoArquivo[];
}
interface CategoriaArquivo {
  slug: string;
  nome: string;
  descricao?: string | null;
  produtos: ProdutoArquivo[];
}
interface Arquivo {
  config?: Record<string, unknown>;
  bairros?: { nome: string; taxa_centavos: number }[];
  categorias: CategoriaArquivo[];
}

function exigir(nome: string): string {
  const valor = process.env[nome];
  if (!valor) {
    console.error(`Variavel ${nome} nao definida. Configure .env.local.`);
    process.exit(1);
  }
  return valor;
}

function validar(dados: Arquivo): string[] {
  const problemas: string[] = [];
  const slugs = new Set<string>();

  if (!Array.isArray(dados.categorias) || dados.categorias.length === 0) {
    problemas.push("nenhuma categoria no arquivo");
  }

  for (const categoria of dados.categorias ?? []) {
    if (!categoria.slug || !categoria.nome) {
      problemas.push(`categoria sem slug ou nome: ${JSON.stringify(categoria.nome)}`);
    }
    for (const produto of categoria.produtos ?? []) {
      if (!produto.slug) problemas.push(`produto sem slug em "${categoria.nome}"`);
      if (slugs.has(produto.slug)) problemas.push(`slug repetido: ${produto.slug}`);
      slugs.add(produto.slug);

      if (!Number.isInteger(produto.preco_centavos) || produto.preco_centavos < 0) {
        problemas.push(
          `preco invalido em "${produto.nome}": use centavos inteiros ` +
            `(recebido: ${produto.preco_centavos})`,
        );
      }
      for (const grupo of produto.grupos ?? []) {
        if (grupo.max_escolhas !== null && grupo.max_escolhas < grupo.min_escolhas) {
          problemas.push(`grupo "${grupo.nome}" de "${produto.nome}": max < min`);
        }
      }
    }
  }
  return problemas;
}

async function principal() {
  const caminho = join(process.cwd(), "dados", "cardapio.json");
  let dados: Arquivo;
  try {
    dados = JSON.parse(readFileSync(caminho, "utf8")) as Arquivo;
  } catch (e) {
    console.error(`Nao consegui ler ${caminho}: ${(e as Error).message}`);
    console.error("Copie dados/cardapio.exemplo.json e preencha com o cardapio real.");
    process.exit(1);
  }

  const problemas = validar(dados);
  if (problemas.length > 0) {
    console.error("Arquivo invalido. Nada foi gravado:\n");
    for (const p of problemas) console.error(`  - ${p}`);
    process.exit(1);
  }

  const db = createClient(
    exigir("NEXT_PUBLIC_SUPABASE_URL"),
    exigir("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false }, db: { schema: "public" } },
  );

  const { error } = await db.rpc("loja_importar_cardapio", { p: dados as never });
  if (error) {
    console.error(`Falha ao importar: ${error.message}`);
    process.exit(1);
  }

  const totalProdutos = dados.categorias.reduce((t, c) => t + c.produtos.length, 0);
  console.log(
    `Cardapio importado: ${dados.categorias.length} categoria(s), ` +
      `${totalProdutos} produto(s), ${dados.bairros?.length ?? 0} bairro(s).`,
  );
}

void principal();
