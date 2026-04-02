import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { HomeEntryActions } from "@/components/home-entry-actions";

export default function HomePage() {
  return (
    <AppShell
      title="Preoperacional y FUEC"
      subtitle="Preoperacional y FUEC en una sola operacion. Diligenciamiento en tiempo real y generacion automatica."
    >
      <div className="stack-lg">
        <section className="brand-hero">
          <div className="brand-hero__header">
            <div className="brand-hero__logo">
              <Image
                alt="Logo Arenas Transporte y Turismo"
                height={86}
                priority
                src="/logo-arenas.png"
                width={220}
              />
            </div>
            <div className="brand-hero__copy">
              <p className="brand-kicker">Arenas Transporte y Turismo</p>
              <h2>Operacion digital en un solo flujo</h2>
              <p>
                El conductor diligencia el preoperacional, adjunta evidencias, firma
                en pantalla y deja habilitado el FUEC solo cuando la inspeccion del
                dia cumple las reglas del negocio.
              </p>
            </div>
          </div>

          <div className="brand-highlight">
            <div className="brand-highlight__item">
              <strong>Tiempo real</strong>
              <span>Registro inmediato desde el celular.</span>
            </div>
            <div className="brand-highlight__item">
              <strong>PDF automatico</strong>
              <span>Soporte normativo generado en el cierre.</span>
            </div>
            <div className="brand-highlight__item">
              <strong>FUEC controlado</strong>
              <span>Solo se emite con preoperacional valido.</span>
            </div>
          </div>
        </section>

        <section className="home-actions-card">
          <div className="home-actions-card__copy">
            <p className="eyebrow">Acceso rapido</p>
            <h2>Ingresa segun tu perfil</h2>
            <p className="muted">
              Conductores y administradores ingresan con sus credenciales y el
              sistema muestra solo lo que corresponde a su rol.
            </p>
          </div>

          <HomeEntryActions />
        </section>
      </div>
    </AppShell>
  );
}
