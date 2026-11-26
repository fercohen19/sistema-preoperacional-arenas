import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { FinanceAdminPanel } from "@/components/finance-admin-panel";

export default function AdminFinancePage() {
  return (
    <AppShell
      eyebrow="Administracion"
      title="Costos y gastos"
      subtitle="Valor de cada servicio, pago a conductores, peajes, combustible y mantenimientos en un solo lugar, con utilidad por periodo y por vehiculo. Exporta todo a Excel."
    >
      <AuthGuard requiredRole="administrador">
        <FinanceAdminPanel />
      </AuthGuard>
    </AppShell>
  );
}
