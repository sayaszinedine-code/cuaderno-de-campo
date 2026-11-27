import type { Metadata } from "next";
import Link from "next/link";
import { APK_URL } from "@/apk/inApk";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/Logo";

export const metadata: Metadata = { title: "Descargar para Android — Cuaderno de Campo" };

const STEPS = [
  { title: "Descarga el archivo", text: "Toca «Descargar APK». Pesa unos 4 MB." },
  {
    title: "Permite instalarla",
    text: "Al abrirla, Android puede pedir permiso para «instalar apps desconocidas» desde tu navegador o tus archivos. Acéptalo solo para esta instalación.",
  },
  { title: "Ábrela e inicia sesión", text: "Toca «Instalar», abre Cuaderno de Campo y entra con tu cuenta." },
];

export default function DescargarPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-5 py-12">
      <Link href="/" className="text-primary font-semibold underline">
        Volver al inicio
      </Link>
      <header className="flex items-center gap-4">
        <Logo size={72} />
        <div>
          <h1 className="text-3xl font-bold sm:text-4xl">Instala la app en tu Android</h1>
          <p className="text-muted">La misma app de la web, con tu misma cuenta y tus colores de siempre.</p>
        </div>
      </header>

      <a href={APK_URL} download className="btn-primary self-start gap-2 text-lg">
        <Icon name="instalar" className="size-6" />
        Descargar APK
      </a>

      <ol aria-label="Pasos" className="space-y-3">
        {STEPS.map((s, i) => (
          <li key={s.title} className="card flex gap-4 p-4">
            <span className="font-display flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--c-lima-soft)] text-lg font-bold text-[var(--c-lima)]">
              {i + 1}
            </span>
            <div>
              <h2 className="text-lg font-semibold">{s.title}</h2>
              <p className="text-muted">{s.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="space-y-2 rounded-[1.25rem] bg-[var(--c-amarillo-soft)] p-4 text-[var(--foreground)]">
        <h2 className="text-lg font-semibold">Bueno saber</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>La primera vez necesitas internet; después funciona sin conexión.</li>
          <li>Se actualiza sola: cada mejora de la web llega a la app sin reinstalar.</li>
          <li>Tus datos se guardan en el celular. Haz respaldos seguido desde Carpeta › Respaldos.</li>
          <li>No reemplaza la app anterior del cuaderno: pueden estar las dos instaladas.</li>
        </ul>
      </section>
    </main>
  );
}
