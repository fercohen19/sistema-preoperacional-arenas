import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { VehicleMaintenancePanel } from "@/components/vehicle-maintenance-panel";

export default function VehicleMaintenancePage() {
  return (
    <AppShell
      title="Mantenimientos y hoja de vida"
      subtitle="Administra el mantenimiento preventivo y correctivo de cada vehiculo, controla proximos servicios y exporta la hoja de vida en PDF."
    >
      <AuthGuard requiredRole="administrador">
        <VehicleMaintenancePanel />
      </AuthGuard>
    </AppShell>
  );
}
