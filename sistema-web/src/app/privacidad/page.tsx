export const metadata = { title: "Política de privacidad — Cuaderno de Campo" };

export default function PrivacidadPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-bold">Política de privacidad</h1>
      <p>
        Esta política se rige por la Ley N.° 29733, Ley de Protección de Datos Personales, y su reglamento.
      </p>
      <h2 className="text-xl font-semibold">Qué guardamos en la nube</h2>
      <p>
        Solo guardamos tus datos de registro: nombres, apellidos, correo electrónico, institución educativa,
        UGEL, región y el estado de tu cuenta (pendiente, activa o suspendida). Los usamos únicamente para
        que un administrador pueda revisar y aprobar tu cuenta.
      </p>
      <h2 className="text-xl font-semibold">Lo que no guardamos</h2>
      <p>
        Los datos de las niñas y los niños, y tu información pedagógica (notas, sesiones, registros),
        permanecen en tu computadora, dentro de la carpeta que eliges. No se envían a nuestros servidores.
      </p>
      <h2 className="text-xl font-semibold">Tus derechos</h2>
      <p>
        Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición escribiendo al
        administrador: [correo del administrador].
      </p>
      <h2 className="text-xl font-semibold">Asistente de IA</h2>
      <p>
        Si en el futuro se habilita un asistente de inteligencia artificial, tendrá su propio consentimiento,
        que podrás aceptar o rechazar de forma independiente.
      </p>
      <p>
        <a href="/registro/" className="text-blue-700 underline">Volver al registro</a>
      </p>
    </main>
  );
}
