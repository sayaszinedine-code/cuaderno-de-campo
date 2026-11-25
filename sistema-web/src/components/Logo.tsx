/** Notebook-and-crayon logo (same artwork as public/logo.svg). Decorative: pair it with the name. */
export function Logo({ size = 40, className = "" }: { size?: number; className?: string }) {
  return (
    <svg data-logo viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className={className}>
      <rect width="64" height="64" rx="16" fill="#FFE0F0" />
      <rect x="15" y="11" width="31" height="42" rx="5" fill="#E0408F" />
      <rect x="21" y="11" width="25" height="42" rx="4" fill="#FFFFFF" />
      <g fill="#FFE0F0" stroke="#C2186B" strokeWidth="1.8">
        <circle cx="15" cy="20" r="2.6" />
        <circle cx="15" cy="30" r="2.6" />
        <circle cx="15" cy="40" r="2.6" />
      </g>
      <path d="M26 23h14M26 29h14M26 35h9" stroke="#F4B6D2" strokeWidth="2.6" strokeLinecap="round" />
      <g transform="rotate(35 44 44)">
        <rect x="40" y="25" width="8" height="27" rx="2" fill="#E8890C" />
        <rect x="40" y="25" width="8" height="4.5" fill="#1A9BD7" />
        <path d="M40 52l4 8 4-8z" fill="#FFD9A0" />
        <path d="M43 58l1 2 1-2z" fill="#3B2F5C" />
      </g>
    </svg>
  );
}

const CAMPO: [letter: string, color: string][] = [
  ["C", "var(--c-rosa)"],
  ["a", "var(--c-celeste)"],
  ["m", "var(--c-naranja)"],
  ["p", "var(--c-lima)"],
  ["o", "var(--c-lila)"],
];

/** «Cuaderno de Campo» with «Campo» in the five section colors. */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-display leading-[1.05] font-bold ${className}`}>
      Cuaderno de{" "}
      <span className="whitespace-nowrap">
        {CAMPO.map(([l, c]) => (
          <span key={l} data-letter style={{ color: c }}>
            {l}
          </span>
        ))}
      </span>
    </span>
  );
}
