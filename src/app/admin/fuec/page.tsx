import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { FuecForm } from "@/components/fuec-form";
import { RecentInspections } from "@/components/recent-inspections";

export default function AdminFuecPage() {
  return (
    <AppShell
      title="Emision controlada del FUEC"
      subtitle="Este modulo deja listo el flujo para validar la inspeccion, liberar el consecutivo de forma automatica y generar el PDF con QR desde el dominio oficial."
    >
      <AuthGuard requiredRole="administrador">
        <div className="stack-lg">
          <FuecForm />
          <RecentInspections />
        </div>
      </AuthGuard>
    </AppShell>
  );
}
