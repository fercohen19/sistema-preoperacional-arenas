import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MainNav } from "./main-nav";

interface AppShellProps {
  title: string;
  subtitle: string;
  eyebrow?: string;
  children: ReactNode;
}

export function AppShell({ title, subtitle, eyebrow = "Arenas Transporte y Turismo", children }: AppShellProps) {
  return (
    <>
      <header className="app-topbar">
        <div className="app-topbar__inner">
          <Link className="app-brand" href="/">
            <span className="app-brand__logo">
              <Image alt="Arenas Transporte y Turismo" height={30} priority src="/logo-arenas.png" width={76} />
            </span>
            <span className="app-brand__name">
              Arenas
              <small>Operacion</small>
            </span>
          </Link>
          <MainNav />
        </div>
      </header>
      <main className="page-shell">
        <section className="hero-card">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="subtitle">{subtitle}</p>
        </section>
        <section className="content-card">{children}</section>
      </main>
    </>
  );
}
