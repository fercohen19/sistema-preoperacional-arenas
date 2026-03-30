import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { RoleHomeLinks } from "@/components/role-home-links";

export default function HomePage() {
  return (
    <AppShell
      title="Preoperacional y FUEC en una sola operacion"
      subtitle="Base inicial para que el diligenciamiento sea en tiempo real, el PDF se genere automaticamente y el FUEC quede bloqueado cuando no exista inspeccion valida."
    >
      <div className="stack-md">
        <Link className="primary-button" href="/login">
          Ingresar al sistema
        </Link>
        <RoleHomeLinks />
        <Link className="secondary-button" href="/validar/DEMO-2026-000001">
          Ver pagina de validacion
        </Link>
      </div>
    </AppShell>
  );
}
