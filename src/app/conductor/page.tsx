import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { DriverFuecDownloads } from "@/components/driver-fuec-downloads";
import { PreoperationalForm } from "@/components/preoperational-form";
import { SystemBanner } from "@/components/system-banner";

export default function DriverDashboardPage() {
  return (
    <AppShell
      eyebrow="Conductor"
      title="Preoperacional del dia"
      subtitle="Diligencia la inspeccion, adjunta las evidencias y firma. Al cerrar se genera el PDF y, si el resultado es apto, administracion puede emitir el FUEC."
    >
      <AuthGuard requiredRole="conductor">
        <div className="stack-lg">
          <SystemBanner
            title="Antes del primer servicio"
            description="El preoperacional se hace una vez al dia por vehiculo. El resultado se calcula en pantalla y se exigen las fotos y la firma."
          />
          <div className="action-row">
            <Link className="ghost-button small-button" href="/conductor/servicios">
              Ver mis servicios de la semana
            </Link>
          </div>
          <PreoperationalForm />
          <DriverFuecDownloads />
        </div>
      </AuthGuard>
    </AppShell>
  );
}
