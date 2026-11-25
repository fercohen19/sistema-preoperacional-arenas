"use client";

import Link from "next/link";
import { useCurrentAppUser } from "@/lib/current-user";

export function HomeEntryActions() {
  const { user, loading } = useCurrentAppUser();

  if (loading) {
    return <p className="muted">Preparando accesos segun el perfil...</p>;
  }

  if (user?.rol === "conductor") {
    return (
      <div className="home-actions-card__buttons">
        <Link className="primary-button home-primary" href="/conductor/servicios">
          Ver mis servicios
        </Link>
        <div className="home-secondary-actions">
          <Link className="secondary-button" href="/conductor">
            Preoperacional del dia
          </Link>
        </div>
      </div>
    );
  }

  if (user?.rol === "administrador") {
    return (
      <div className="home-actions-card__buttons">
        <Link className="primary-button home-primary" href="/admin">
          Ir al panel administrativo
        </Link>
        <div className="home-secondary-actions">
          <Link className="secondary-button" href="/admin/servicios">
            Agenda de servicios
          </Link>
          <Link className="secondary-button" href="/admin/rutas">
            Rutas
          </Link>
          <Link className="secondary-button" href="/admin/fuec">
            FUEC
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="home-actions-card__buttons">
      <Link className="primary-button home-primary" href="/login">
        Ingresar al sistema
      </Link>
    </div>
  );
}
