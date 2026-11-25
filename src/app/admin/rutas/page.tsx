import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { RoutesAdminPanel } from "@/components/routes-admin-panel";

export default function AdminRoutesPage() {
  return (
    <AppShell
      eyebrow="Rutas"
      title="Rutas y paradas"
      subtitle="Define las paradas donde se recoge al personal, optimiza el orden para recorrer menos kilometros y calcula a que hora debe pasar el conductor por cada punto."
    >
      <AuthGuard requiredRole="administrador">
        <RoutesAdminPanel />
      </AuthGuard>
    </AppShell>
  );
}
