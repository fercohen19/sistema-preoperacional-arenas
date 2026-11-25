// Lector de archivos .ics (exportacion de Google Calendar) sin dependencias.
// Soporta eventos simples y recurrentes DAILY / WEEKLY / MONTHLY con
// INTERVAL, COUNT, UNTIL, BYDAY y EXDATE, expandidos dentro de un rango.

export interface CalendarOccurrence {
  uid: string;
  importKey: string; // uid + fecha de la ocurrencia
  titulo: string;
  descripcion: string;
  ubicacion: string;
  fecha: string; // YYYY-MM-DD hora Bogota
  horaInicio: string; // HH:MM
  horaFin: string | null;
  todoElDia: boolean;
  cancelado: boolean;
}

interface RawEvent {
  props: Record<string, { value: string; params: Record<string, string> }>;
  exdates: string[];
}

const TIME_ZONE = "America/Bogota";

function unfold(text: string) {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
}

function unescapeText(value: string) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseEvents(text: string): RawEvent[] {
  const events: RawEvent[] = [];
  let current: RawEvent | null = null;
  let depth = 0;

  for (const line of unfold(text).split("\n")) {
    if (line === "BEGIN:VEVENT") {
      current = { props: {}, exdates: [] };
      depth = 0;
      continue;
    }
    if (!current) continue;
    if (line.startsWith("BEGIN:")) {
      depth += 1;
      continue;
    }
    if (line.startsWith("END:") && depth > 0) {
      depth -= 1;
      continue;
    }
    if (line === "END:VEVENT") {
      events.push(current);
      current = null;
      continue;
    }
    if (depth > 0) continue; // ignora VALARM

    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const head = line.slice(0, colon);
    const value = line.slice(colon + 1);
    const [name, ...paramParts] = head.split(";");
    const params: Record<string, string> = {};
    paramParts.forEach((part) => {
      const [key, paramValue] = part.split("=");
      if (key && paramValue) params[key.toUpperCase()] = paramValue.replace(/"/g, "");
    });
    const key = name.toUpperCase();
    if (key === "EXDATE") {
      current.exdates.push(...value.split(","));
    } else if (!(key in current.props)) {
      current.props[key] = { value, params };
    }
  }

  return events;
}

/** Convierte un valor DTSTART/DTEND en un instante (Date) real. */
function parseIcsDate(value: string, params: Record<string, string>): { date: Date; allDay: boolean } | null {
  const clean = value.trim();
  if (/^\d{8}$/.test(clean) || params.VALUE === "DATE") {
    const y = Number(clean.slice(0, 4));
    const m = Number(clean.slice(4, 6));
    const d = Number(clean.slice(6, 8));
    // Medio dia UTC para que la fecha no cambie al convertir a Bogota.
    return { date: new Date(Date.UTC(y, m - 1, d, 12)), allDay: true };
  }

  const match = clean.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
  if (!match) return null;
  const [, y, mo, d, h, mi, s, z] = match;
  const utcGuess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s));
  if (z === "Z") return { date: new Date(utcGuess), allDay: false };

  const tz = params.TZID || TIME_ZONE;
  // Hora local de una zona: se corrige con el desfase de esa zona en ese instante.
  const offset = zoneOffsetMinutes(new Date(utcGuess), tz);
  return { date: new Date(utcGuess - offset * 60000), allDay: false };
}

function zoneOffsetMinutes(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(date);
    const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - date.getTime()) / 60000);
  } catch {
    return -300; // Bogota UTC-5
  }
}

function bogotaParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";
  return { fecha: `${get("year")}-${get("month")}-${get("day")}`, hora: `${get("hour")}:${get("minute")}` };
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
// Bogota no tiene horario de verano: dia de la semana local = UTC - 5 h.
const localWeekday = (t: number) => new Date(t - 5 * 3600000).getUTCDay();

function expandRule(start: Date, rule: string, rangeEnd: Date): Date[] {
  const options: Record<string, string> = {};
  rule.split(";").forEach((part) => {
    const [key, value] = part.split("=");
    if (key && value) options[key.toUpperCase()] = value;
  });
  const freq = options.FREQ;
  const interval = Math.max(Number(options.INTERVAL ?? 1), 1);
  const count = options.COUNT ? Number(options.COUNT) : Number.POSITIVE_INFINITY;
  const untilParsed = options.UNTIL ? parseIcsDate(options.UNTIL, {}) : null;
  const until = untilParsed ? untilParsed.date : rangeEnd;
  const limit = until < rangeEnd ? until : rangeEnd;
  const byDay = options.BYDAY ? options.BYDAY.split(",").map((day) => day.slice(-2)) : null;

  const results: Date[] = [];
  const day = 86400000;
  let produced = 0;

  if (freq === "DAILY") {
    for (let t = start.getTime(); t <= limit.getTime() && produced < count; t += interval * day) {
      const candidate = new Date(t);
      if (byDay && !byDay.includes(WEEKDAYS[localWeekday(t)])) continue;
      results.push(candidate);
      produced += 1;
    }
  } else if (freq === "WEEKLY") {
    const days = byDay ?? [WEEKDAYS[localWeekday(start.getTime())]];
    const weekStart = start.getTime() - ((localWeekday(start.getTime()) + 6) % 7) * day; // lunes
    for (let w = 0; weekStart + w * 7 * day <= limit.getTime() && produced < count; w += interval) {
      for (let offset = 0; offset < 7 && produced < count; offset += 1) {
        const t = weekStart + w * 7 * day + offset * day;
        const candidate = new Date(t);
        if (t < start.getTime() || t > limit.getTime()) continue;
        if (!days.includes(WEEKDAYS[localWeekday(t)])) continue;
        results.push(candidate);
        produced += 1;
      }
    }
  } else if (freq === "MONTHLY") {
    for (let m = 0; produced < count; m += interval) {
      const candidate = new Date(start.getTime());
      candidate.setUTCMonth(start.getUTCMonth() + m);
      if (candidate > limit) break;
      if (candidate.getUTCDate() !== start.getUTCDate()) continue;
      results.push(candidate);
      produced += 1;
    }
  } else {
    results.push(start);
  }
  return results;
}

/**
 * Devuelve las ocurrencias entre desde y hasta (YYYY-MM-DD, inclusive).
 */
export function parseCalendarFile(text: string, desde: string, hasta: string): CalendarOccurrence[] {
  const events = parseEvents(text);
  const rangeStart = new Date(`${desde}T00:00:00-05:00`);
  const rangeEnd = new Date(`${hasta}T23:59:59-05:00`);
  const overrides = new Set<string>();
  const occurrences: CalendarOccurrence[] = [];

  // Eventos modificados de una serie (RECURRENCE-ID) reemplazan la ocurrencia original.
  events.forEach((event) => {
    const recurrence = event.props["RECURRENCE-ID"];
    const uid = event.props.UID?.value;
    if (recurrence && uid) {
      const parsed = parseIcsDate(recurrence.value, recurrence.params);
      if (parsed) overrides.add(`${uid}|${bogotaParts(parsed.date).fecha}`);
    }
  });

  events.forEach((event) => {
    const uid = event.props.UID?.value ?? `sin-uid-${Math.random().toString(36).slice(2)}`;
    const startProp = event.props.DTSTART;
    if (!startProp) return;
    const start = parseIcsDate(startProp.value, startProp.params);
    if (!start) return;
    const endProp = event.props.DTEND;
    const end = endProp ? parseIcsDate(endProp.value, endProp.params) : null;
    const durationMs = end ? end.date.getTime() - start.date.getTime() : 3600000;

    const isOverride = Boolean(event.props["RECURRENCE-ID"]);
    const rule = event.props.RRULE?.value;
    const starts = rule && !isOverride ? expandRule(start.date, rule, rangeEnd) : [start.date];
    const excluded = new Set(
      event.exdates
        .map((value) => parseIcsDate(value, startProp.params))
        .filter(Boolean)
        .map((parsed) => bogotaParts((parsed as { date: Date }).date).fecha)
    );

    starts.forEach((occurrenceStart) => {
      if (occurrenceStart < rangeStart || occurrenceStart > rangeEnd) return;
      const local = bogotaParts(occurrenceStart);
      if (excluded.has(local.fecha)) return;
      if (!isOverride && rule && overrides.has(`${uid}|${local.fecha}`)) return;

      const localEnd = bogotaParts(new Date(occurrenceStart.getTime() + durationMs));
      const sameDayEnd = localEnd.fecha === local.fecha && localEnd.hora > local.hora;
      occurrences.push({
        uid,
        importKey: `${uid}|${local.fecha}`,
        titulo: unescapeText(event.props.SUMMARY?.value ?? "Servicio sin titulo"),
        descripcion: unescapeText(event.props.DESCRIPTION?.value ?? ""),
        ubicacion: unescapeText(event.props.LOCATION?.value ?? ""),
        fecha: local.fecha,
        horaInicio: start.allDay ? "06:00" : local.hora,
        horaFin: start.allDay ? null : sameDayEnd ? localEnd.hora : null,
        todoElDia: start.allDay,
        cancelado: (event.props.STATUS?.value ?? "").toUpperCase() === "CANCELLED"
      });
    });
  });

  return occurrences.sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`));
}
