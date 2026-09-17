import { Cabecalho } from "@/components/cabecalho";
import { Cardapio } from "@/components/cardapio";
import { carregarCatalogo } from "@/lib/catalogo";

// o cardapio muda pouco; 30s mantem a home rapida sem servir preco velho
export const revalidate = 30;

export default async function PaginaInicial() {
  const catalogo = await carregarCatalogo();

  return (
    <main>
      <Cabecalho
        nomeLoja={catalogo.config.nome_loja}
        cidade={catalogo.config.cidade}
        aberta={catalogo.config.loja_aberta}
      />
      <Cardapio catalogo={catalogo} />
    </main>
  );
}
