import { AdminOperationsPanel } from "@/components/admin-operations-panel";
import { AppShell } from "@/components/app-shell";
import { SystemBanner } from "@/components/system-banner";

export default function AdminDashboardPage() {
  return (
    <AppShell
      title="Panel administrativo"
      subtitle="Vista inicial para consultar preoperacionales, revisar evidencias, controlar PDFs y habilitar la emision de FUEC solo cuando la inspeccion del dia este cerrada y aprobada."
    >
      <div className="stack-lg">
        <SystemBanner
          title="Historial administrativo activo"
          description="Aqui ya puedes consultar preoperacionales y FUEC emitidos desde Supabase, filtrarlos y abrir sus PDFs o validaciones publicas."
        />
        <AdminOperationsPanel />
      </div>
    </AppShell>
  );
}
