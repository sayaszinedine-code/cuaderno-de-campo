import type { ReactNode } from "react";

export const ICON_NAMES = [
  "inicio",
  "cuaderno",
  "ninos",
  "aulas",
  "notas",
  "unidades",
  "asistencia",
  "agenda",
  "reportes",
  "perfil",
  "carpeta",
  "cuenta",
  "admin",
  "mas",
  "instalar",
  "check",
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** Simple 24×24 line icons drawn with the current text color. */
const PATHS: Record<IconName, ReactNode> = {
  inicio: (
    <>
      <path d="M3 11 12 4l9 7" />
      <path d="M5 10v10h5v-6h4v6h5V10" />
    </>
  ),
  cuaderno: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <path d="M9 3v18M12 8h4M12 12h4" />
    </>
  ),
  ninos: (
    <>
      <circle cx="12" cy="7" r="3" />
      <path d="M6 21v-3a6 6 0 0 1 12 0v3" />
    </>
  ),
  aulas: (
    <>
      <path d="M3 10 12 5l9 5" />
      <path d="M5 10v9h14v-9M10 19v-5h4v5" />
    </>
  ),
  notas: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z" />,
  unidades: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 13 9 5 9-5" />
    </>
  ),
  asistencia: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <polyline points="8 12 11 15 16 9" />
    </>
  ),
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  reportes: <path d="M4 20V10M10 20V4M16 20v-7M21 20H3" />,
  perfil: (
    <>
      <circle cx="12" cy="9" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <circle cx="12" cy="12" r="10" />
    </>
  ),
  carpeta: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  cuenta: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v3M21 12v2" />
    </>
  ),
  admin: <path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" />,
  mas: (
    <>
      <circle cx="5" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="19" cy="12" r="1.5" />
    </>
  ),
  instalar: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 17v3h16v-3" />
    </>
  ),
  check: <polyline points="5 12 10 17 19 7" />,
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
