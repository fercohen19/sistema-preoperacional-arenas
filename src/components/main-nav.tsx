import type { Route } from "next";
import Link from "next/link";

const links = [
  { href: "/" as Route, label: "Inicio" },
  { href: "/login" as Route, label: "Acceso" },
  { href: "/conductor" as Route, label: "Conductor" },
  { href: "/admin" as Route, label: "Administrador" },
  { href: "/admin/fuec" as Route, label: "FUEC" }
];

export function MainNav() {
  return (
    <nav className="main-nav" aria-label="Principal">
      {links.map((link) => (
        <Link className="main-nav__link" href={link.href} key={link.href}>
          {link.label}
        </Link>
      ))}
    </nav>
  );
}
