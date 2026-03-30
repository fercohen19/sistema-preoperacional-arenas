import type { ReactNode } from "react";
import { MainNav } from "./main-nav";

interface AppShellProps {
  title: string;
  subtitle: string;
  children: ReactNode;
}

export function AppShell({ title, subtitle, children }: AppShellProps) {
  return (
    <main className="page-shell">
      <MainNav />
      <section className="hero-card">
        <p className="eyebrow">Arenas Transporte y Turismo</p>
        <h1>{title}</h1>
        <p className="subtitle">{subtitle}</p>
      </section>
      <section className="content-card">{children}</section>
    </main>
  );
}
