import { Cabecalho } from "@/components/cabecalho";
import { AcompanhamentoPedido } from "@/components/acompanhamento-pedido";
import { carregarCatalogo } from "@/lib/catalogo";

export const dynamic = "force-dynamic";

export default async function PaginaPedido({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const { numero } = await params;
  const { token } = await searchParams;
  const catalogo = await carregarCatalogo();

  return (
    <main>
      <Cabecalho
        nomeLoja={catalogo.config.nome_loja}
        cidade={catalogo.config.cidade}
        aberta={catalogo.config.loja_aberta}
      />
      <div className="mx-auto max-w-3xl px-4 py-6">
        {token ? (
          <AcompanhamentoPedido numero={numero} token={token} />
        ) : (
          <p className="text-(--color-perigo)">
            Link inválido: falta o código de acompanhamento do pedido.
          </p>
        )}
      </div>
    </main>
  );
}
