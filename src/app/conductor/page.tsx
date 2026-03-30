import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardCards } from "@/components/dashboard-cards";
import { PreoperationalForm } from "@/components/preoperational-form";
import { SystemBanner } from "@/components/system-banner";

export default function DriverDashboardPage() {
  return (
    <AppShell
      title="Panel del conductor"
      subtitle="Formulario movil para diligenciar la inspeccion, adjuntar evidencias, firmar y generar automaticamente el PDF del preoperacional."
    >
      <AuthGuard requiredRole="conductor">
        <div className="stack-lg">
          <SystemBanner
            title="Formulario operativo"
            description="El resultado ya se calcula en pantalla y se valida que existan evidencias obligatorias. Lo siguiente es persistir los datos y emitir el PDF automaticamente."
          />
          <DashboardCards />
          <PreoperationalForm />
        </div>
      </AuthGuard>
    </AppShell>
  );
}
