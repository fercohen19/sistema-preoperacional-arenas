import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ServicesAdminPanel } from "@/components/services-admin-panel";

export default function AdminServicesPage() {
  return (
    <AppShell
      eyebrow="Programacion"
      title="Servicios agendados"
      subtitle="Agenda semanal de servicios: asigna conductor y vehiculo, evita cruces de horario, importa lo que ya esta en Google Calendar y revisa cuantos servicios hace cada conductor."
    >
      <AuthGuard requiredRole="administrador">
        <ServicesAdminPanel />
      </AuthGuard>
    </AppShell>
  );
}
