import { getBogotaDate } from "./date-utils";
import { supabase } from "./supabase";

export type ServiceStatus = "PROGRAMADO" | "EN_CURSO" | "COMPLETADO" | "CANCELADO";

export const SERVICE_STATUS_LABEL: Record<ServiceStatus, string> = {
  PROGRAMADO: "Programado",
  EN_CURSO: "En curso",
  COMPLETADO: "Completado",
  CANCELADO: "Cancelado"
};

export interface ServiceRecord {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string;
  cliente: string | null;
  contrato_referencia: string | null;
  origen: string | null;
  destino: string | null;
  pasajeros: number | null;
  descripcion: string | null;
  ruta_id: string | null;
  vehiculo_id: string | null;
  conductor_id: string | null;
  estado: ServiceStatus;
  origen_registro: "MANUAL" | "GOOGLE_CALENDAR";
  google_event_uid: string | null;
  iniciado_at: string | null;
  finalizado_at: string | null;
  observaciones_conductor: string | null;
}

export const SERVICE_COLUMNS =
  "id, fecha, hora_inicio, hora_fin, titulo, cliente, contrato_referencia, origen, destino, pasajeros, descripcion, ruta_id, vehiculo_id, conductor_id, estado, origen_registro, google_event_uid, iniciado_at, finalizado_at, observaciones_conductor";

export interface RouteRecord {
  id: string;
  nombre: string;
  cliente: string | null;
  descripcion: string | null;
  tipo: "RECOGIDA" | "RETORNO";
  partida_nombre: string | null;
  partida_lat: number | null;
  partida_lng: number | null;
  destino_nombre: string | null;
  destino_lat: number | null;
  destino_lng: number | null;
  hora_objetivo: string | null;
  velocidad_promedio_kmh: number;
  minutos_por_parada: number;
  tolerancia_minutos: number;
  distancia_estimada_km: number | null;
  duracion_estimada_min: number | null;
  activa: boolean;
}

export const ROUTE_COLUMNS =
  "id, nombre, cliente, descripcion, tipo, partida_nombre, partida_lat, partida_lng, destino_nombre, destino_lat, destino_lng, hora_objetivo, velocidad_promedio_kmh, minutos_por_parada, tolerancia_minutos, distancia_estimada_km, duracion_estimada_min, activa";

export interface RouteStopRecord {
  id: string;
  ruta_id: string;
  orden: number;
  nombre: string;
  direccion: string | null;
  lat: number | null;
  lng: number | null;
  pasajeros: number;
  personal: string | null;
  minutos_desde_inicio: number;
}

export const STOP_COLUMNS =
  "id, ruta_id, orden, nombre, direccion, lat, lng, pasajeros, personal, minutos_desde_inicio";

export interface StopLogRecord {
  id: string;
  servicio_id: string;
  parada_id: string | null;
  parada_nombre: string;
  orden: number | null;
  estado: "RECOGIDO" | "NO_SE_PRESENTO" | "OMITIDA";
  registrado_at: string;
  hora_programada: string | null;
  minutos_diferencia: number | null;
  pasajeros_abordo: number | null;
  lat: number | null;
  lng: number | null;
  observacion: string | null;
}

export const STOP_LOG_COLUMNS =
  "id, servicio_id, parada_id, parada_nombre, orden, estado, registrado_at, hora_programada, minutos_diferencia, pasajeros_abordo, lat, lng, observacion";

export interface DriverOption {
  id: string;
  documento: string;
  nombre_completo: string;
  estado: string;
}

export interface VehicleOption {
  id: string;
  placa: string;
  tipo_vehiculo: string;
  capacidad: number | null;
  estado: string;
}

// ---------------------------------------------------------------------
// Fechas y semanas (lunes a domingo, hora Colombia)
// ---------------------------------------------------------------------

export function todayBogota() {
  return getBogotaDate();
}

export function addDays(isoDate: string, days: number) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function weekStartOf(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 domingo
  return addDays(isoDate, -((weekday + 6) % 7));
}

export function weekDays(weekStart: string) {
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
}

const DAY_NAMES = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function dayLabel(isoDate: string) {
  const [y, m, d] = isoDate.split("-").map(Number);
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return { dia: DAY_NAMES[weekday], corto: DAY_NAMES[weekday].slice(0, 3), numero: d, mes: MONTH_NAMES[m - 1] };
}

export function formatShortDate(isoDate: string) {
  const label = dayLabel(isoDate);
  return `${label.corto} ${label.numero} ${label.mes}`;
}

export function weekRangeLabel(weekStart: string) {
  const end = addDays(weekStart, 6);
  const a = dayLabel(weekStart);
  const b = dayLabel(end);
  return `${a.numero} ${a.mes} - ${b.numero} ${b.mes} ${end.slice(0, 4)}`;
}

export function hhmm(value: string | null | undefined) {
  return value ? value.slice(0, 5) : "";
}

export function addMinutesToTime(time: string, minutes: number) {
  const [h, m] = time.split(":").map(Number);
  const total = (((h * 60 + m + minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------
// Reglas de negocio en cliente (la base las vuelve a validar)
// ---------------------------------------------------------------------

function endMinutes(service: Pick<ServiceRecord, "hora_inicio" | "hora_fin">) {
  const [h, m] = service.hora_inicio.split(":").map(Number);
  const start = h * 60 + m;
  if (service.hora_fin) {
    const [eh, em] = service.hora_fin.split(":").map(Number);
    return eh * 60 + em;
  }
  return Math.min(start + 60, 1439);
}

/** Servicios que se cruzan con el borrador por conductor o vehiculo. */
export function findConflicts(
  draft: Pick<ServiceRecord, "id" | "fecha" | "hora_inicio" | "hora_fin" | "conductor_id" | "vehiculo_id" | "estado">,
  services: ServiceRecord[]
) {
  if (draft.estado === "CANCELADO") return [];
  const [h, m] = draft.hora_inicio.split(":").map(Number);
  const start = h * 60 + m;
  const end = endMinutes(draft);
  return services.filter((service) => {
    if (service.id === draft.id || service.fecha !== draft.fecha || service.estado === "CANCELADO") return false;
    const sameDriver = draft.conductor_id && service.conductor_id === draft.conductor_id;
    const sameVehicle = draft.vehiculo_id && service.vehiculo_id === draft.vehiculo_id;
    if (!sameDriver && !sameVehicle) return false;
    const [sh, sm] = service.hora_inicio.split(":").map(Number);
    return sh * 60 + sm < end && endMinutes(service) > start;
  });
}

export interface WeeklyDriverSummary {
  conductorId: string | null;
  asignados: number;
  completados: number;
  enCurso: number;
  cancelados: number;
  pendientes: number;
}

export function summarizeByDriver(services: ServiceRecord[]) {
  const map = new Map<string, WeeklyDriverSummary>();
  services.forEach((service) => {
    const key = service.conductor_id ?? "SIN_ASIGNAR";
    const current =
      map.get(key) ??
      { conductorId: service.conductor_id, asignados: 0, completados: 0, enCurso: 0, cancelados: 0, pendientes: 0 };
    if (service.estado === "CANCELADO") current.cancelados += 1;
    else {
      current.asignados += 1;
      if (service.estado === "COMPLETADO") current.completados += 1;
      if (service.estado === "EN_CURSO") current.enCurso += 1;
      if (service.estado === "PROGRAMADO") current.pendientes += 1;
    }
    map.set(key, current);
  });
  return [...map.values()];
}

export function friendlyDbError(message: string | undefined) {
  if (!message) return "Ocurrio un error inesperado.";
  if (/relation .* does not exist|Could not find the table/i.test(message)) {
    return "El modulo aun no esta creado en Supabase. Ejecuta la migracion 2026-11-25_modulo_servicios_y_rutas.sql.";
  }
  if (/row-level security/i.test(message)) {
    return "No tienes permiso para esta accion.";
  }
  return message;
}

// ---------------------------------------------------------------------
// Consultas comunes
// ---------------------------------------------------------------------

export async function loadFleetOptions() {
  if (!supabase) return { drivers: [] as DriverOption[], vehicles: [] as VehicleOption[], error: "Supabase no esta configurado." };
  const [drivers, vehicles] = await Promise.all([
    supabase.from("conductores").select("id, documento, nombre_completo, estado").order("nombre_completo"),
    supabase.from("vehiculos").select("id, placa, tipo_vehiculo, capacidad, estado").order("placa")
  ]);
  return {
    drivers: (drivers.data ?? []) as DriverOption[],
    vehicles: (vehicles.data ?? []) as VehicleOption[],
    error: drivers.error?.message ?? vehicles.error?.message ?? null
  };
}

export async function loadServicesBetween(desde: string, hasta: string, conductorId?: string) {
  if (!supabase) return { data: [] as ServiceRecord[], error: "Supabase no esta configurado." };
  let query = supabase
    .from("servicios")
    .select(SERVICE_COLUMNS)
    .gte("fecha", desde)
    .lte("fecha", hasta)
    .order("fecha")
    .order("hora_inicio");
  if (conductorId) query = query.eq("conductor_id", conductorId);
  const { data, error } = await query;
  return { data: (data ?? []) as ServiceRecord[], error: error ? friendlyDbError(error.message) : null };
}

export async function loadCurrentDriverId(documento: string) {
  if (!supabase || !documento) return null;
  const { data } = await supabase.from("conductores").select("id").eq("documento", documento).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}
