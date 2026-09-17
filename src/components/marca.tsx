import Image from "next/image";

/** Logo oficial. Trocar o arquivo em public/marca/ atualiza todo o site. */
export function Logo({ tamanho = 56 }: { tamanho?: number }) {
  return (
    <Image
      src="/marca/logo-original.png"
      alt="Triplo Xis Lanches"
      width={tamanho}
      height={tamanho}
      priority
      className="rounded-full"
    />
  );
}
