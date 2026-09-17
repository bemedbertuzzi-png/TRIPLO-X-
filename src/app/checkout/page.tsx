import Link from "next/link";
import { Cabecalho } from "@/components/cabecalho";
import { FormularioCheckout } from "@/components/formulario-checkout";
import { carregarCatalogo } from "@/lib/catalogo";

export const revalidate = 30;

export default async function PaginaCheckout() {
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
          href="/carrinho"
          className="text-sm text-(--color-tinta-suave) hover:text-(--color-tinta)"
        >
          ← Voltar ao carrinho
        </Link>
        <h2 className="mt-3 font-[family-name:var(--fonte-display)] text-2xl font-bold">
          Finalizar pedido
        </h2>
        <FormularioCheckout catalogo={catalogo} />
      </div>
    </main>
  );
}
