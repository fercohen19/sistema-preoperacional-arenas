import Image from "next/image";
import { AppShell } from "@/components/app-shell";
import { HomeEntryActions } from "@/components/home-entry-actions";

export default function HomePage() {
  return (
    <AppShell
      title="Operacion de transporte en un solo lugar"
      subtitle="Servicios agendados, rutas con paradas y horarios, preoperacional, FUEC y mantenimientos de la flota."
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
              <h2>Del agendamiento a la recogida</h2>
              <p>
                Administracion agenda los servicios y asigna conductor y vehiculo. El
                conductor ve su semana, hace el preoperacional, sigue la ruta con sus
                paradas y marca cada recogida para dejar registro de puntualidad.
              </p>
            </div>
          </div>

          <div className="brand-highlight">
            <div className="brand-highlight__item">
              <strong>Agenda de servicios</strong>
              <span>Conductor y vehiculo asignados, sin cruces de horario.</span>
            </div>
            <div className="brand-highlight__item">
              <strong>Rutas optimizadas</strong>
              <span>Orden de paradas por menor recorrido y hora de paso.</span>
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
