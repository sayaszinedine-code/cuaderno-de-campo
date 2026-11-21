import type { Metadata } from "next";

export const metadata: Metadata = { title: "Página no encontrada — Cuaderno de Campo" };

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg items-center p-6">
      <section className="card w-full space-y-4 p-6">
        <h1 className="text-xl font-semibold">No encontramos esta página.</h1>
        <p className="text-muted">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        <a href="/inicio/" className="btn-primary">
          Ir a Inicio
        </a>
      </section>
    </main>
  );
}
