export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-bold">Cuaderno de Campo</h1>
      <a href="/login/" className="rounded bg-blue-600 px-4 py-2 text-white">
        Iniciar sesión
      </a>
    </main>
  );
}
