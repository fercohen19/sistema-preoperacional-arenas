"use client";

import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon, type IconName } from "./icons";
import { useCurrentAppUser } from "@/lib/current-user";
import { supabase } from "@/lib/supabase";

type NavLink = { href: Route; label: string; icon: IconName };

const publicLinks: NavLink[] = [
  { href: "/" as Route, label: "Inicio", icon: "home" },
  { href: "/login" as Route, label: "Acceso", icon: "login" }
];

const adminLinks: NavLink[] = [
  { href: "/admin" as Route, label: "Panel", icon: "dashboard" },
  { href: "/admin/servicios" as Route, label: "Servicios", icon: "calendar" },
  { href: "/admin/rutas" as Route, label: "Rutas", icon: "route" },
  { href: "/admin/fuec" as Route, label: "FUEC", icon: "file" },
  { href: "/admin/mantenimientos" as Route, label: "Mantenimientos", icon: "wrench" }
];

const driverLinks: NavLink[] = [
  { href: "/conductor/servicios" as Route, label: "Mis servicios", icon: "calendar" },
  { href: "/conductor" as Route, label: "Preoperacional", icon: "clipboard" },
  { href: "/conductor/mantenimientos" as Route, label: "Mantenimientos", icon: "wrench" }
];

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  if (href === "/admin" || href === "/conductor") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function MainNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading } = useCurrentAppUser();

  const links = user?.rol === "administrador" ? adminLinks : user?.rol === "conductor" ? driverLinks : loading ? [] : publicLinks;

  return (
    <div className="main-nav-wrap">
      <nav className="main-nav" aria-label="Principal">
        {links.map((link) => (
          <Link
            aria-current={isActive(pathname, link.href) ? "page" : undefined}
            className={isActive(pathname, link.href) ? "main-nav__link is-active" : "main-nav__link"}
            href={link.href}
            key={link.href}
          >
            <Icon name={link.icon} />
            {link.label}
          </Link>
        ))}
      </nav>

      <div className="main-nav__session">
        {loading ? (
          <span className="nav-user-pill">
            <span className="nav-user-pill__avatar">·</span>
          </span>
        ) : user ? (
          <>
            <span className="nav-user-pill" title={`${user.nombreCompleto} (${user.rol})`}>
              <span className="nav-user-pill__avatar">{initials(user.nombreCompleto)}</span>
              <span className="nav-user-pill__text">
                <strong>{user.nombreCompleto}</strong>
                <small>{user.rol}</small>
              </span>
            </span>
            <button
              className="secondary-button nav-logout small-button"
              onClick={async () => {
                if (supabase) {
                  await supabase.auth.signOut();
                }
                router.replace("/login");
                router.refresh();
              }}
              type="button"
            >
              Salir
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
