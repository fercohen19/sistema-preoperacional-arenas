import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { VehicleMaintenancePanel } from "@/components/vehicle-maintenance-panel";

export default function DriverMaintenancePage() {
  return (
    <AppShell
      title="Mantenimientos de mi vehiculo"
      subtitle="Registra los mantenimientos preventivos y correctivos del vehiculo que tienes asignado."
    >
      <AuthGuard requiredRole="conductor">
        <VehicleMaintenancePanel role="conductor" />
      </AuthGuard>
    </AppShell>
  );
}
