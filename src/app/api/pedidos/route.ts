import { NextResponse } from "next/server";
import { esquemaCriarPedido, errosPorCampo } from "@/lib/validacao";
import { supabaseAdmin, traduzirErroPostgres } from "@/lib/supabase/admin";
import { erro, ipDaRequisicao, limitarTaxa, ok, registrar } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Cria o pedido.
 *
 * O corpo traz apenas ids, quantidades e opcoes. Nenhum preco enviado pelo
 * navegador e considerado: `loja_criar_pedido` recalcula tudo a partir do
 * banco, valida disponibilidade e aplica as regras dos grupos de opcoes.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ip = ipDaRequisicao(req);
  if (!limitarTaxa(`pedido:${ip}`, 10, 60_000)) {
    return erro("MUITAS_TENTATIVAS", "Muitas tentativas. Aguarde um minuto.", 429);
  }

  let corpo: unknown;
  try {
    corpo = await req.json();
  } catch {
    return erro("JSON_INVALIDO", "Requisição inválida.", 400);
  }

  const analise = esquemaCriarPedido.safeParse(corpo);
  if (!analise.success) {
    return NextResponse.json(
      {
        erro: {
          codigo: "DADOS_INVALIDOS",
          mensagem: "Confira os campos destacados.",
          campos: errosPorCampo(analise.error),
        },
      },
      { status: 422 },
    );
  }

  const dados = analise.data;

  const { data, error } = await supabaseAdmin().rpc("loja_criar_pedido", {
    p: {
      modalidade: dados.modalidade,
      cliente: dados.cliente,
      endereco: dados.endereco ?? null,
      observacao: dados.observacao ?? null,
      itens: dados.itens,
      idempotency_key: dados.idempotency_key,
    },
  });

  if (error) {
    const { codigo, mensagem } = traduzirErroPostgres(error.message);
    registrar("pedido_recusado", { codigo });
    const status = codigo === "ERRO_INTERNO" ? 500 : 409;
    return erro(codigo, mensagem, status);
  }

  const pedido = data as {
    numero_publico: string;
    token_acompanhamento: string;
    total_centavos: number;
    duplicado: boolean;
  };

  registrar("pedido_criado", {
    numero: pedido.numero_publico,
    duplicado: pedido.duplicado,
    total_centavos: pedido.total_centavos,
  });

  return ok(pedido, pedido.duplicado ? 200 : 201);
}
