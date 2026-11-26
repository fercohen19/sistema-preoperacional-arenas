import type { SupabaseClient } from "@supabase/supabase-js";
import { parseCalendarFile, type CalendarOccurrence } from "@/lib/ics-import";

// Sincronizacion de Google Calendar -> servicios.
// Fuente: "Direccion secreta en formato iCal" del calendario (solo lectura).
// Reglas:
//  * Evento nuevo            -> se crea el servicio (PROGRAMADO).
//  * Evento modificado       -> se actualizan fecha/horas/titulo/lugar si el servicio sigue PROGRAMADO.
//  * Evento movido de dia    -> se conserva el servicio (y su conductor/vehiculo) si el evento no se repite.
//  * Evento borrado/cancelado-> el servicio futuro PROGRAMADO pasa a CANCELADO.
//  * Servicios EN_CURSO, COMPLETADOS o creados a mano nunca se tocan.

export interface SyncResult {
  ok: boolean;
  eventosLeidos: number;
  creados: number;
  actualizados: number;
  cancelados: number;
  errores: string[];
  mensaje: string;
}

type ExistingService = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string | null;
  titulo: string;
  descripcion: string | null;
  origen: string | null;
  estado: string;
  google_event_uid: string;
};

function todayBogota() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());
}

function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

const uidOf = (key: string) => key.slice(0, key.lastIndexOf("|"));
const hm = (value: string | null) => (value ? value.slice(0, 5) : null);

/** Lee "Valor: $470.000", "Conductor: Williams", "Placa: WMK123", "Pasajeros: 12", "Cliente: X". */
export function parseEventDetails(text: string) {
  const find = (label: string) => {
    const match = text.match(new RegExp(`(?:^|\\n|\\s)(?:${label})\\s*[:=]\\s*([^\\n]+)`, "i"));
    return match ? match[1].trim() : "";
  };
  const money = find("valor|tarifa|precio");
  const valor = money ? Number(money.replace(/[^\d,]/g, "").replace(/,\d{1,2}$/, "").replace(/,/g, "")) : 0;
  const pasajeros = Number(find("pasajeros|pax").replace(/\D/g, "")) || null;
  return {
    valor: Number.isFinite(valor) ? valor : 0,
    conductor: find("conductor"),
    placa: find("placa|vehiculo|vehículo").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10),
    pasajeros,
    cliente: find("cliente").slice(0, 150)
  };
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export async function syncCalendar(
  client: SupabaseClient,
  icsUrl: string,
  origen: "MANUAL" | "AUTOMATICA" | "CRON"
): Promise<SyncResult> {
  const result: SyncResult = { ok: false, eventosLeidos: 0, creados: 0, actualizados: 0, cancelados: 0, errores: [], mensaje: "" };
  const { data: logRow } = await client
    .from("calendario_sincronizaciones")
    .insert({ origen })
    .select("id")
    .single();

  try {
    const today = todayBogota();
    const desde = shiftDate(today, -Number(process.env.CALENDAR_SYNC_DAYS_BACK ?? 7));
    const hasta = shiftDate(today, Number(process.env.CALENDAR_SYNC_DAYS_AHEAD ?? 90));

    const response = await fetch(icsUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Google Calendar respondio ${response.status}. Revisa la direccion secreta iCal.`);
    const text = await response.text();
    if (!text.includes("BEGIN:VCALENDAR")) throw new Error("La direccion configurada no devolvio un calendario iCal.");

    const occurrences = parseCalendarFile(text, desde, hasta);
    result.eventosLeidos = occurrences.length;

    const [{ data: existingRows, error: existingError }, { data: drivers }, { data: vehicles }] = await Promise.all([
      client
        .from("servicios")
        .select("id, fecha, hora_inicio, hora_fin, titulo, descripcion, origen, estado, google_event_uid")
        .eq("origen_registro", "GOOGLE_CALENDAR")
        .gte("fecha", shiftDate(desde, -30))
        .lte("fecha", shiftDate(hasta, 30)),
      client.from("conductores").select("id, nombre_completo, estado"),
      client.from("vehiculos").select("id, placa")
    ]);
    if (existingError) throw new Error(existingError.message);

    const existing = (existingRows ?? []) as ExistingService[];
    const byKey = new Map(existing.map((row) => [row.google_event_uid, row]));
    const occurrencesByUid = new Map<string, CalendarOccurrence[]>();
    occurrences.forEach((item) => occurrencesByUid.set(item.uid, [...(occurrencesByUid.get(item.uid) ?? []), item]));
    const existingByUid = new Map<string, ExistingService[]>();
    existing.forEach((row) => {
      const uid = uidOf(row.google_event_uid);
      existingByUid.set(uid, [...(existingByUid.get(uid) ?? []), row]);
    });

    const matched = new Set<string>();

    for (const item of occurrences) {
      let current = byKey.get(item.importKey);
      // Evento no recurrente movido a otro dia: mismo UID, una sola ocurrencia.
      if (!current) {
        const sameUid = existingByUid.get(item.uid) ?? [];
        if (sameUid.length === 1 && (occurrencesByUid.get(item.uid)?.length ?? 0) === 1 && !matched.has(sameUid[0].id)) {
          current = sameUid[0];
        }
      }

      if (current) {
        matched.add(current.id);
        if (current.estado !== "PROGRAMADO") continue;
        if (item.cancelado) {
          const { error } = await client.from("servicios").update({ estado: "CANCELADO", updated_at: new Date().toISOString() }).eq("id", current.id);
          if (error) result.errores.push(`${item.fecha} ${item.titulo}: ${error.message}`);
          else result.cancelados += 1;
          continue;
        }
        const patch = {
          fecha: item.fecha,
          hora_inicio: item.horaInicio,
          hora_fin: item.horaFin,
          titulo: item.titulo.slice(0, 200),
          descripcion: item.descripcion || null,
          origen: item.ubicacion ? item.ubicacion.slice(0, 250) : null,
          google_event_uid: item.importKey.slice(0, 300)
        };
        const changed =
          current.fecha !== patch.fecha ||
          hm(current.hora_inicio) !== patch.hora_inicio ||
          hm(current.hora_fin) !== patch.hora_fin ||
          current.titulo !== patch.titulo ||
          (current.descripcion ?? null) !== patch.descripcion ||
          (current.origen ?? null) !== patch.origen ||
          current.google_event_uid !== patch.google_event_uid;
        if (!changed) continue;
        const { error } = await client.from("servicios").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", current.id);
        if (error) result.errores.push(`${item.fecha} ${item.titulo}: ${error.message}`);
        else result.actualizados += 1;
        continue;
      }

      if (item.cancelado) continue;

      // Servicio nuevo: se intenta leer conductor, placa, valor y pasajeros de la descripcion.
      const details = parseEventDetails(`${item.descripcion}\n`);
      const driver = details.conductor
        ? (drivers ?? []).find(
            (row) => row.estado === "ACTIVO" && normalize(row.nombre_completo as string).includes(normalize(details.conductor))
          )
        : undefined;
      const vehicle = details.placa ? (vehicles ?? []).find((row) => (row.placa as string).toUpperCase() === details.placa) : undefined;

      const row = {
        fecha: item.fecha,
        hora_inicio: item.horaInicio,
        hora_fin: item.horaFin,
        titulo: item.titulo.slice(0, 200),
        descripcion: item.descripcion || null,
        origen: item.ubicacion ? item.ubicacion.slice(0, 250) : null,
        cliente: details.cliente || null,
        pasajeros: details.pasajeros,
        conductor_id: (driver?.id as string | undefined) ?? null,
        vehiculo_id: (vehicle?.id as string | undefined) ?? null,
        estado: "PROGRAMADO",
        origen_registro: "GOOGLE_CALENDAR",
        google_event_uid: item.importKey.slice(0, 300)
      };

      let insert = await client.from("servicios").insert(row).select("id").single();
      if (insert.error && /Cruce de horario/.test(insert.error.message)) {
        // Si la asignacion leida del evento se cruza, se crea sin asignar.
        insert = await client.from("servicios").insert({ ...row, conductor_id: null, vehiculo_id: null }).select("id").single();
      }
      if (insert.error || !insert.data) {
        result.errores.push(`${item.fecha} ${item.titulo}: ${insert.error?.message ?? "sin respuesta"}`);
        continue;
      }
      result.creados += 1;
      if (details.valor > 0) {
        await client.from("servicio_finanzas").upsert({ servicio_id: insert.data.id, valor_servicio: details.valor });
      }
    }

    // Eventos que ya no estan en el calendario: cancelar servicios futuros sin iniciar.
    const orphanIds = existing
      .filter((row) => !matched.has(row.id) && row.estado === "PROGRAMADO" && row.fecha >= today && row.fecha <= hasta)
      .map((row) => row.id);
    // Proteccion: si el calendario llega vacio (direccion cambiada o error de Google) no se cancela nada.
    if (orphanIds.length && occurrences.length === 0) {
      throw new Error(
        `El calendario no trajo eventos y hay ${orphanIds.length} servicio(s) futuros que se cancelarian. No se cancelo nada; revisa la direccion iCal.`
      );
    }
    if (orphanIds.length) {
      const { error } = await client
        .from("servicios")
        .update({ estado: "CANCELADO", updated_at: new Date().toISOString() })
        .in("id", orphanIds);
      if (error) result.errores.push(`Cancelacion de eventos eliminados: ${error.message}`);
      else result.cancelados += orphanIds.length;
    }

    result.ok = true;
    result.mensaje = `Leidos ${result.eventosLeidos} eventos: ${result.creados} nuevos, ${result.actualizados} actualizados, ${result.cancelados} cancelados.`;
  } catch (error) {
    result.ok = false;
    result.mensaje = error instanceof Error ? error.message : "Error inesperado en la sincronizacion.";
  }

  if (logRow?.id) {
    await client
      .from("calendario_sincronizaciones")
      .update({
        finalizado_at: new Date().toISOString(),
        ok: result.ok,
        eventos_leidos: result.eventosLeidos,
        creados: result.creados,
        actualizados: result.actualizados,
        cancelados: result.cancelados,
        errores: result.errores.slice(0, 50),
        mensaje: result.mensaje
      })
      .eq("id", logRow.id);
  }

  return result;
}
