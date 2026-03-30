import { mockRecentInspections } from "@/lib/mock-data";

export function RecentInspections() {
  return (
    <article className="table-card">
      <div className="table-card__header">
        <div>
          <p className="eyebrow">Seguimiento</p>
          <h2>Inspecciones recientes</h2>
        </div>
        <p className="muted">Base inicial para el panel administrativo.</p>
      </div>

      <div className="table-list">
        {mockRecentInspections.map((inspection) => (
          <div className="table-row" key={inspection.codigo}>
            <div>
              <strong>{inspection.codigo}</strong>
              <p className="muted">{inspection.fecha}</p>
            </div>
            <div>
              <strong>{inspection.placa}</strong>
              <p className="muted">{inspection.conductor}</p>
            </div>
            <div>
              <span className="status-pill">{inspection.resultado}</span>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
