import { AppShell } from "@/components/app-shell";
import { FuecForm } from "@/components/fuec-form";
import { RecentInspections } from "@/components/recent-inspections";

export default function AdminFuecPage() {
  return (
    <AppShell
      title="Emision controlada del FUEC"
      subtitle="Este modulo deja listo el flujo para validar la inspeccion, liberar el consecutivo de forma automatica y generar el PDF con QR desde el dominio oficial."
    >
      <div className="stack-lg">
        <FuecForm />
        <RecentInspections />
      </div>
    </AppShell>
  );
}
