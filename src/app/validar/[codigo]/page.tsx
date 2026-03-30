import { AppShell } from "@/components/app-shell";

interface ValidationPageProps {
  params: Promise<{ codigo: string }>;
}

export default async function ValidationPage({ params }: ValidationPageProps) {
  const { codigo } = await params;

  return (
    <AppShell
      title="Validacion publica de documento"
      subtitle="Esta pagina es la base para la lectura del QR y la confirmacion de autenticidad del preoperacional o del FUEC."
    >
      <div className="stack-md">
        <p className="validation-code">{codigo}</p>
        <article className="check-item">
          <h2>Estado</h2>
          <p className="subtitle">
            Documento encontrado. Cuando se conecte con la base de datos, aqui
            se mostraran placa, conductor, fecha de emision, estado y enlace al
            PDF oficial.
          </p>
        </article>
      </div>
    </AppShell>
  );
}
