const TONES: Record<string, string> = {
  APTO: "ok",
  COMPLETADO: "ok",
  EMITIDO: "ok",
  RECOGIDO: "ok",
  VIGENTE: "ok",
  APTO_CON_OBSERVACION: "warn",
  PROGRAMADO: "info",
  PENDIENTE: "warn",
  EN_CURSO: "live",
  NO_APTO: "danger",
  NO_SE_PRESENTO: "danger",
  ANULADO: "danger",
  CANCELADO: "muted",
  OMITIDA: "muted"
};

const LABELS: Record<string, string> = {
  APTO_CON_OBSERVACION: "Apto con observacion",
  NO_APTO: "No apto",
  EN_CURSO: "En curso",
  NO_SE_PRESENTO: "No se presento"
};

export function StatusPill({ value, label }: { value: string | null | undefined; label?: string }) {
  const key = (value ?? "PENDIENTE").toUpperCase();
  const tone = TONES[key] ?? "warn";
  const text = label ?? LABELS[key] ?? key.charAt(0) + key.slice(1).toLowerCase().replaceAll("_", " ");
  return <span className={`status-pill status-pill--${tone}`}>{text}</span>;
}
