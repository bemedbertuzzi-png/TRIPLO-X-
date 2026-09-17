import Link from "next/link";
import { Logo } from "./marca";

export function Cabecalho({
  nomeLoja,
  cidade,
  aberta,
}: {
  nomeLoja: string;
  cidade: string;
  aberta: boolean;
}) {
  return (
    <header className="relative overflow-hidden border-b border-(--color-borda)">
      {/* brilho quente da identidade da marca */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          background:
            "radial-gradient(70% 120% at 50% -20%, rgba(255,200,3,0.22), transparent 60%), radial-gradient(50% 100% at 80% 0%, rgba(232,35,31,0.20), transparent 70%)",
        }}
      />
      <div className="relative mx-auto flex max-w-3xl items-center gap-4 px-4 py-6">
        <Link href="/" aria-label="Início">
          <Logo tamanho={64} />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-[family-name:var(--fonte-display)] text-2xl font-extrabold tracking-tight">
            {nomeLoja}
          </h1>
          <p className="truncate text-sm text-(--color-tinta-suave)">{cidade}</p>
        </div>
        <span
          className={[
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            aberta
              ? "bg-(--color-sucesso)/15 text-(--color-sucesso)"
              : "bg-(--color-perigo)/15 text-(--color-perigo)",
          ].join(" ")}
        >
          {aberta ? "Aberto" : "Fechado"}
        </span>
      </div>
    </header>
  );
}
