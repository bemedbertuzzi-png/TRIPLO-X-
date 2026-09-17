import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { ConteudoCarrinho } from "@/components/conteudo-carrinho";
import { carregarCatalogo } from "@/lib/catalogo";

export const revalidate = 30;

export default async function PaginaCarrinho() {
  const catalogo = await carregarCatalogo();

  return (
    <main>
      <Cabecalho
        nomeLoja={catalogo.config.nome_loja}
        cidade={catalogo.config.cidade}
        aberta={catalogo.config.loja_aberta}
      />
      <div className="mx-auto max-w-3xl px-4 py-6">
        <Link
          href="/"
          className="text-sm text-(--color-tinta-suave) hover:text-(--color-tinta)"
        >
          ← Continuar comprando
        </Link>
        <h2 className="mt-3 font-[family-name:var(--fonte-display)] text-2xl font-bold">
          Seu carrinho
        </h2>
        <ConteudoCarrinho catalogo={catalogo} />
      </div>
    </main>
  );
}
