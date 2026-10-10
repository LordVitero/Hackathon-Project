export function Mascot({ large = false }: { large?: boolean }) {
  return <svg className={large ? "mascot large" : "mascot"} viewBox="0 0 120 120" role="img" aria-label="Illustrated green dragon; not the reference photo">
    <path d="M30 91Q5 80 28 62" fill="none" stroke="#417b36" strokeWidth="11" strokeLinecap="round"/>
    <path d="M35 92 13 54 44 67M84 92 105 54 76 67" fill="#96bd62" stroke="#417b36" strokeWidth="3"/>
    <path d="M33 86c0-29 15-44 29-44s30 15 30 44c0 18-13 23-30 23S33 104 33 86" fill="#78af4f"/>
    <ellipse cx="63" cy="85" rx="17" ry="19" fill="#cfdf91"/>
    <path d="m43 25-2-15 13 14m17 0 13-14-1 16" fill="#c5d67f" stroke="#417b36" strokeWidth="3" strokeLinejoin="round"/>
    <path d="M33 42c0-21 16-23 29-18 15-6 31-2 31 18 0 17-17 28-31 28S33 59 33 42" fill="#7db650"/>
    <ellipse cx="45" cy="38" rx="9" ry="11" fill="#fffdf5"/><ellipse cx="80" cy="38" rx="9" ry="11" fill="#fffdf5"/>
    <ellipse cx="48" cy="40" rx="3" ry="5" fill="#233c2b"/><ellipse cx="77" cy="40" rx="3" ry="5" fill="#233c2b"/>
    <path d="M51 54q11 9 22 0" stroke="#233c2b" strokeWidth="3" strokeLinecap="round" fill="none"/>
    <path d="m35 81-10 9m63-9 10 9" stroke="#78af4f" strokeWidth="9" strokeLinecap="round"/>
  </svg>;
}
