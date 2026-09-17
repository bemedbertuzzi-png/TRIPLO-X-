import { NextResponse } from "next/server";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { provedorPagamento } from "@/lib/pagamentos";
import { erro, ipDaRequisicao, limitarTaxa, ok, registrar } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const esquema = z.object({
  numero: z.string().trim().min(4).max(40),
  token: z.string().trim().min(16).max(128),
});

/**
 * Cria (ou reaproveita) a cobranca Pix do pedido.
 *
 * Reentrante: se ja existe cobranca pendente para o pedido, devolve a mesma em
 * vez de abrir outra — evita duas cobrancas para o mesmo pedido.
 */
export async function POST(req: Request): Promise<NextResponse> {
  const ip = ipDaRequisicao(req);
  if (!limitarTaxa(`pix:${ip}`, 20, 60_000)) {
    return erro("MUITAS_TENTATIVAS", "Muitas tentativas. Aguarde um minuto.", 429);
  }

  const analise = esquema.safeParse(await req.json().catch(() => null));
  if (!analise.success) {
    return erro("DADOS_INVALIDOS", "Requisição inválida.", 400);
  }

  const db = supabaseAdmin();
  const { data: pedido, error: erroConsulta } = await db.rpc("loja_consultar_pedido", {
    p_numero: analise.data.numero,
    p_token: analise.data.token,
  });

  if (erroConsulta) return erro("ERRO_INTERNO", "Falha ao consultar o pedido.", 500);
  if (!pedido) return erro("NAO_ENCONTRADO", "Pedido não encontrado.", 404);

  const p = pedido as {
    numero_publico: string;
    total_centavos: number;
    status_pagamento: string;
    cliente_nome: string;
    pagamento: { status: string; qr_code: string; qr_code_imagem: string | null; expira_em: string } | null;
  };

  if (p.status_pagamento === "pago") {
    return erro("JA_PAGO", "Este pedido já foi pago.", 409);
  }

  // cobranca pendente e ainda valida: devolve a existente
  const existente = p.pagamento;
  if (
    existente &&
    existente.status === "pendente" &&
    existente.qr_code &&
    (!existente.expira_em || new Date(existente.expira_em) > new Date())
  ) {
    return ok({
      qr_code: existente.qr_code,
      qr_code_imagem: existente.qr_code_imagem,
      expira_em: existente.expira_em,
      reaproveitada: true,
    });
  }

  let provedor;
  try {
    provedor = provedorPagamento();
  } catch (e) {
    registrar("pix_provedor_indisponivel", { motivo: (e as Error).message });
    return erro(
      "PAGAMENTO_INDISPONIVEL",
      "Pagamento por Pix indisponível no momento.",
      503,
    );
  }

  // id interno do pedido, necessario para registrar a cobranca
  const { data: idInterno, error: erroId } = await db.rpc("loja_id_do_pedido", {
    p_numero: p.numero_publico,
  });
  if (erroId || !idInterno) {
    return erro("ERRO_INTERNO", "Falha ao preparar a cobrança.", 500);
  }

  let cobranca;
  try {
    cobranca = await provedor.criarCobranca({
      pedidoId: String(idInterno),
      numeroPublico: p.numero_publico,
      valorCentavos: p.total_centavos,
      descricao: `Pedido ${p.numero_publico} - Triplo Xis Lanches`,
      expiraEmSegundos: 1800,
      clienteNome: p.cliente_nome,
    });
  } catch (e) {
    registrar("pix_falha_criar_cobranca", { motivo: (e as Error).message });
    return erro(
      "PAGAMENTO_INDISPONIVEL",
      "Não foi possível gerar o Pix agora. Tente novamente.",
      502,
    );
  }

  const { error: erroRegistro } = await db.rpc("loja_registrar_cobranca", {
    p_pedido_id: String(idInterno),
    p_provedor: cobranca.provedor,
    p_cobranca_id: cobranca.cobrancaId,
    p_txid: cobranca.txid,
    p_valor_centavos: p.total_centavos,
    p_qr_code: cobranca.qrCode,
    p_qr_code_imagem: cobranca.qrCodeImagem,
    p_expira_em: cobranca.expiraEm.toISOString(),
  });

  if (erroRegistro) {
    registrar("pix_falha_registro", { numero: p.numero_publico });
    return erro("ERRO_INTERNO", "Falha ao registrar a cobrança.", 500);
  }

  registrar("pix_cobranca_criada", {
    numero: p.numero_publico,
    provedor: cobranca.provedor,
  });

  return ok({
    qr_code: cobranca.qrCode,
    qr_code_imagem: cobranca.qrCodeImagem,
    expira_em: cobranca.expiraEm.toISOString(),
    reaproveitada: false,
  });
}
