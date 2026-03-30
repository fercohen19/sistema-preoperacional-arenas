import { AppShell } from "@/components/app-shell";
import { LoginRedirect } from "@/components/login-redirect";
import { LoginForm } from "@/components/login-form";
import { SystemBanner } from "@/components/system-banner";

export default function LoginPage() {
  return (
    <AppShell
      title="Acceso por roles"
      subtitle="El conductor diligencia el preoperacional. El administrador consulta evidencias, genera FUEC y valida el cumplimiento del flujo."
    >
      <div className="stack-md">
        <LoginRedirect />
        <SystemBanner
          title="Estado de integracion"
          description="El formulario ya puede autenticarse con Supabase cuando registremos las credenciales reales. Mientras tanto, conserva modo base para seguir construyendo flujos."
        />
        <LoginForm />
      </div>
    </AppShell>
  );
}
