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
        <Link className="primary-button home-primary" href="/conductor">
          Ir a mi preoperacional
        </Link>
        <div className="home-secondary-actions">
          <Link className="secondary-button" href="/validar/DEMO-2026-000001">
            Validar documento
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
          <Link className="secondary-button" href="/admin/fuec">
            Ir a FUEC
          </Link>
          <Link className="secondary-button" href="/validar/DEMO-2026-000001">
            Validar documento
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
      <div className="home-secondary-actions">
        <Link className="secondary-button" href="/validar/DEMO-2026-000001">
          Validar documento
        </Link>
      </div>
    </div>
  );
}
