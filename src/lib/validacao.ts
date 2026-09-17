import { z } from "zod";

const texto = (min: number, max: number) =>
  z.string().trim().min(min).max(max);

export const esquemaItemPedido = z.object({
  produto_id: z.string().uuid("Produto inválido"),
  quantidade: z.number().int().min(1).max(50),
  opcao_ids: z.array(z.string().uuid()).max(30).default([]),
  observacao: z.string().trim().max(300).optional(),
});

export const esquemaEndereco = z.object({
  logradouro: texto(3, 160),
  numero: texto(1, 20),
  complemento: z.string().trim().max(80).optional(),
  bairro_id: z.string().uuid("Selecione um bairro atendido"),
  referencia: z.string().trim().max(160).optional(),
});

/** Telefone brasileiro com DDD, aceitando mascara. */
export const esquemaTelefone = z
  .string()
  .trim()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((v) => v.length >= 10 && v.length <= 13, {
    message: "Informe um telefone com DDD",
  });

export const esquemaCriarPedido = z
  .object({
    modalidade: z.enum(["entrega", "retirada"]),
    cliente: z.object({
      nome: texto(2, 80),
      telefone: esquemaTelefone,
    }),
    endereco: esquemaEndereco.optional(),
    observacao: z.string().trim().max(500).optional(),
    itens: z.array(esquemaItemPedido).min(1, "Adicione ao menos um item").max(50),
    idempotency_key: texto(8, 100),
  })
  .refine((d) => d.modalidade !== "entrega" || d.endereco !== undefined, {
    message: "Informe o endereço de entrega",
    path: ["endereco"],
  });

export type EntradaCriarPedido = z.infer<typeof esquemaCriarPedido>;

export const esquemaConsultaPedido = z.object({
  numero: texto(4, 40),
  token: texto(16, 128),
});

export const esquemaStatusPedido = z.object({
  numero: texto(4, 40),
  status: z.enum([
    "recebido",
    "em_preparacao",
    "pronto",
    "saiu_entrega",
    "finalizado",
    "cancelado",
  ]),
});

export const esquemaConfirmarImpressao = z.object({
  id: z.string().uuid(),
  ok: z.boolean(),
  erro: z.string().max(500).optional(),
});

/** Converte erros do zod em um mapa campo -> mensagem, pronto para a UI. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const problema of erro.issues) {
    const chave = problema.path.join(".") || "_";
    if (!saida[chave]) saida[chave] = problema.message;
  }
  return saida;
}
