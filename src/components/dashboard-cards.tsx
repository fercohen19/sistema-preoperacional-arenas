export function DashboardCards() {
  const cards = [
    {
      title: "Preoperacional del dia",
      value: "1 pendiente",
      note: "Debe cerrarse antes de habilitar FUEC."
    },
    {
      title: "Evidencias",
      value: "5 requeridas",
      note: "Fotos y firma obligatorias."
    },
    {
      title: "Validacion",
      value: "QR activo",
      note: "Cada PDF debe poder verificarse en linea."
    }
  ];

  return (
    <div className="stats-grid">
      {cards.map((card) => (
        <article className="stat-card" key={card.title}>
          <p className="eyebrow">{card.title}</p>
          <h3>{card.value}</h3>
          <p className="muted">{card.note}</p>
        </article>
      ))}
    </div>
  );
}
