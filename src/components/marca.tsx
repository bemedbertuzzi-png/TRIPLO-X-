import Image from "next/image";

/**
 * Logo oficial. Trocar public/marca/logo.png atualiza o site inteiro.
 *
 * `object-cover` com largura e altura fixas garante o círculo mesmo se o
 * arquivo trocado não for quadrado — sem isso, uma imagem retangular estica
 * a marca.
 */
export function Logo({ tamanho = 56 }: { tamanho?: number }) {
  return (
    <Image
      src="/marca/logo.png"
      alt="Triplo Xis Lanches"
      width={tamanho}
      height={tamanho}
      priority
      style={{ width: tamanho, height: tamanho }}
      className="shrink-0 rounded-full object-cover"
    />
  );
}
