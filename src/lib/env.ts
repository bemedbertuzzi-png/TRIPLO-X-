/**
 * Acesso centralizado e tipado as variaveis de ambiente.
 *
 * Regra: tudo que nao comeca com NEXT_PUBLIC_ so pode ser lido no servidor.
 * `exigir()` falha alto e cedo em vez de deixar a aplicacao rodar meia-configurada.
 */

function exigir(nome: string, valor: string | undefined): string {
  if (!valor || valor.trim() === "") {
    throw new Error(
      `Variavel de ambiente ausente: ${nome}. Configure-a em .env.local ou na Vercel.`,
    );
  }
  return valor;
}

function opcional(valor: string | undefined, padrao = ""): string {
  return valor?.trim() ? valor.trim() : padrao;
}

export const envPublico = {
  supabaseUrl: opcional(process.env.NEXT_PUBLIC_SUPABASE_URL),
  supabaseAnonKey: opcional(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  siteUrl: opcional(process.env.NEXT_PUBLIC_SITE_URL, "http://localhost:3000"),
};

/** So chame dentro de codigo de servidor (route handlers, server components). */
export const envServidor = {
  get supabaseUrl() {
    return exigir("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);
  },
  get supabaseServiceRoleKey() {
    return exigir("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);
  },
  get pagamentoProvider() {
    return opcional(process.env.PAGAMENTO_PROVIDER, "dev");
  },
  get pixChave() {
    return opcional(process.env.PIX_CHAVE);
  },
  get pixBeneficiario() {
    return opcional(process.env.PIX_BENEFICIARIO, "TRIPLO XIS LANCHES");
  },
  get pixCidade() {
    return opcional(process.env.PIX_CIDADE, "OSORIO");
  },
  get mercadoPagoAccessToken() {
    return opcional(process.env.MERCADOPAGO_ACCESS_TOKEN);
  },
  get mercadoPagoWebhookSecret() {
    return opcional(process.env.MERCADOPAGO_WEBHOOK_SECRET);
  },
  get impressaoToken() {
    return exigir("IMPRESSAO_TOKEN", process.env.IMPRESSAO_TOKEN);
  },
  get adminToken() {
    return exigir("ADMIN_TOKEN", process.env.ADMIN_TOKEN);
  },
  get fiscalProvider() {
    return opcional(process.env.FISCAL_PROVIDER, "nenhum");
  },
};

export const ehProducao = process.env.NODE_ENV === "production";
