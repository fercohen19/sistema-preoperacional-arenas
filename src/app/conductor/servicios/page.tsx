import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { DriverServicesPanel } from "@/components/driver-services-panel";

export default function DriverServicesPage() {
  return (
    <AppShell
      eyebrow="Conductor"
      title="Mis servicios"
      subtitle="Tus servicios de la semana con hora, vehiculo y ruta. Marca cada recogida al llegar a la parada para dejar registro de puntualidad."
    >
      <AuthGuard requiredRole="conductor">
        <DriverServicesPanel />
      </AuthGuard>
    </AppShell>
  );
}
