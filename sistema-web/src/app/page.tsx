import { Logo, Wordmark } from "@/components/Logo";
import { Icon, type IconName } from "@/components/icons";

const FEATURES: { icon: IconName; title: string; text: string; color: string }[] = [
  { icon: "cuaderno", title: "Cuaderno de campo con fotos", text: "Registra lo que observas en el aula, con evidencias.", color: "rosa" },
  { icon: "notas", title: "Notas y reportes", text: "Calificaciones por competencia, informes en PDF y Excel.", color: "naranja" },
  { icon: "agenda", title: "Asistencia y agenda", text: "Pasa lista y organiza tus actividades del día.", color: "lila" },
  { icon: "check", title: "Funciona sin internet", text: "Instálala y úsala aunque no tengas conexión.", color: "lima" },
];

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-12 px-5 py-12">
      <section className="page-enter flex flex-col items-center gap-5 text-center">
        <Logo size={96} className="drop-shadow-md" />
        <h1 className="text-5xl sm:text-6xl">
          <Wordmark />
        </h1>
        <p className="text-muted max-w-xl text-lg">
          Tu cuaderno de campo, notas y sesiones de Educación Inicial, en un solo lugar.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <a href="/login/" className="btn-primary">
            Iniciar sesión
          </a>
          <a href="/registro/" className="btn-secondary">
            Crear una cuenta
          </a>
        </div>
      </section>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((f) => (
          <li key={f.title} className={`sec-${f.color} flex flex-col gap-2 rounded-[1.5rem] bg-[var(--sec-soft)] p-5`}>
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--surface)] text-[var(--sec)]">
              <Icon name={f.icon} className="size-7" />
            </span>
            <strong className="font-display text-lg text-[var(--sec)]">{f.title}</strong>
            <span className="text-sm">{f.text}</span>
          </li>
        ))}
      </ul>

      <p className="text-muted text-center text-sm">
        Tus datos se quedan en tu computadora.{" "}
        <a href="/privacidad/" className="text-primary underline">
          Política de privacidad
        </a>
      </p>
    </main>
  );
}
