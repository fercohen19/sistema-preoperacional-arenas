import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { FleetAdminPanel } from "@/components/fleet-admin-panel";

export default function AdminFleetPage() {
  return (
    <AppShell
      eyebrow="Flota"
      title="Conductores y vehiculos"
      subtitle="Agrega o desactiva conductores y vehiculos, crea su acceso al sistema y asigna a cada conductor los vehiculos de los que registra mantenimientos."
    >
      <AuthGuard requiredRole="administrador">
        <FleetAdminPanel />
      </AuthGuard>
    </AppShell>
  );
}
