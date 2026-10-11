import Image from "next/image";

export function Mascot({ large = false }: { large?: boolean }) {
  return <Image
    className={large ? "mascot large" : "mascot"}
    src="/lenny.svg"
    width={720}
    height={940}
    alt={large ? "Lenny, the green dragon, waving" : ""}
    unoptimized
  />;
}
