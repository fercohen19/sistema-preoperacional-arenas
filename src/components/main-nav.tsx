"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCurrentAppUser } from "@/lib/current-user";
import { supabase } from "@/lib/supabase";

const publicLinks = [
  { href: "/" as Route, label: "Inicio" },
  { href: "/login" as Route, label: "Acceso" }
];

export function MainNav() {
  const router = useRouter();
  const { user, loading } = useCurrentAppUser();

  const links =
    user?.rol === "administrador"
      ? [
          { href: "/" as Route, label: "Inicio" },
          { href: "/admin" as Route, label: "Administrador" },
          { href: "/admin/fuec" as Route, label: "FUEC" }
        ]
      : user?.rol === "conductor"
        ? [
            { href: "/" as Route, label: "Inicio" },
            { href: "/conductor" as Route, label: "Conductor" }
          ]
        : publicLinks;

  return (
    <div className="main-nav-wrap">
      <nav className="main-nav" aria-label="Principal">
        {links.map((link) => (
          <Link className="main-nav__link" href={link.href} key={link.href}>
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="main-nav__session">
        {loading ? (
          <span className="nav-user-pill">Verificando sesion...</span>
        ) : user ? (
          <>
            <span className="nav-user-pill">
              {user.nombreCompleto} | {user.rol}
            </span>
            <button
              className="secondary-button nav-logout"
              onClick={async () => {
                if (supabase) {
                  await supabase.auth.signOut();
                }
                router.replace("/login");
                router.refresh();
              }}
              type="button"
            >
              Cerrar sesion
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
