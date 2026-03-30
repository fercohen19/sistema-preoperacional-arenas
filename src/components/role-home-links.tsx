import Link from "next/link";

export function RoleHomeLinks() {
  return (
    <div className="action-row">
      <Link className="secondary-button" href="/conductor">
        Ir al panel conductor
      </Link>
      <Link className="secondary-button" href="/admin">
        Ir al panel administrador
      </Link>
    </div>
  );
}
