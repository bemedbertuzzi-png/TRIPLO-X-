import type { Metadata, Viewport } from "next";
import { Baloo_2, Inter } from "next/font/google";
import { CarrinhoProvider } from "@/components/carrinho-contexto";
import "./globals.css";

const corpo = Inter({ subsets: ["latin"], variable: "--fonte-corpo" });
const display = Baloo_2({ subsets: ["latin"], variable: "--fonte-display" });

export const metadata: Metadata = {
  title: "Triplo Xis Lanches | Peça online",
  description:
    "Peça seu xis direto com o Triplo Xis Lanches, em Osório/RS. Entrega e retirada, pagamento via Pix.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#0b0b0c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${corpo.variable} ${display.variable}`}>
      <body className="min-h-dvh font-[family-name:var(--fonte-corpo)] antialiased">
        <CarrinhoProvider>{children}</CarrinhoProvider>
      </body>
    </html>
  );
}
