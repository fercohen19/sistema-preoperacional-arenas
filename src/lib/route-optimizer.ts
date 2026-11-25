// Optimizacion de rutas sin servicios externos.
// - Distancia: haversine (linea recta) multiplicada por un factor de via urbana.
// - Orden de paradas: vecino mas cercano + mejora 2-opt (punto de partida fijo,
//   destino final fijo opcional).
// - Horarios: se calculan hacia atras desde la hora en que el personal debe
//   llegar (RECOGIDA) o hacia adelante desde la salida (RETORNO).
// - Recursos: division de paradas en varios vehiculos segun capacidad.

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface RouteStopInput {
  key: string;
  nombre: string;
  lat: number | null;
  lng: number | null;
  pasajeros: number;
}

export interface RouteSettings {
  tipo: "RECOGIDA" | "RETORNO";
  partida: GeoPoint | null;
  destino: GeoPoint | null;
  horaObjetivo: string; // HH:MM
  velocidadKmh: number;
  minutosPorParada: number;
}

export interface ScheduledStop {
  key: string;
  minutosDesdeInicio: number;
  hora: string;
  tramoKm: number;
}

export interface RouteSchedule {
  horaInicio: string;
  horaFin: string;
  distanciaKm: number;
  duracionMin: number;
  paradas: ScheduledStop[];
}

/** Factor de correccion de linea recta a recorrido por calles (ciudad). */
export const ROAD_FACTOR = 1.35;

export function haversineKm(a: GeoPoint, b: GeoPoint) {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function roadKm(a: GeoPoint, b: GeoPoint) {
  return haversineKm(a, b) * ROAD_FACTOR;
}

export function hasCoords(stop: { lat: number | null; lng: number | null }): boolean {
  return (
    typeof stop.lat === "number" &&
    typeof stop.lng === "number" &&
    Number.isFinite(stop.lat) &&
    Number.isFinite(stop.lng) &&
    Math.abs(stop.lat) <= 90 &&
    Math.abs(stop.lng) <= 180
  );
}

function pathKm(points: GeoPoint[]) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    total += roadKm(points[index - 1], points[index]);
  }
  return total;
}

/** Distancia total del recorrido: partida -> paradas -> destino. */
export function routeDistanceKm(
  stops: RouteStopInput[],
  partida: GeoPoint | null,
  destino: GeoPoint | null
) {
  const points: GeoPoint[] = [];
  if (partida) points.push(partida);
  stops.filter(hasCoords).forEach((stop) => points.push({ lat: stop.lat as number, lng: stop.lng as number }));
  if (destino) points.push(destino);
  return pathKm(points);
}

/**
 * Ordena las paradas para minimizar la distancia.
 * Las paradas sin coordenadas se dejan al final en su orden original.
 */
export function optimizeStopOrder<T extends RouteStopInput>(
  stops: T[],
  partida: GeoPoint | null,
  destino: GeoPoint | null
): T[] {
  const located = stops.filter(hasCoords);
  const pending = stops.filter((stop) => !hasCoords(stop));
  if (located.length < 2) return [...located, ...pending];

  const pt = (stop: T): GeoPoint => ({ lat: stop.lat as number, lng: stop.lng as number });

  // 1. Vecino mas cercano. Si no hay partida, prueba cada parada como inicio.
  const candidatesStart = partida ? [null] : located.map((_, index) => index);
  let best: T[] = located;
  let bestKm = Number.POSITIVE_INFINITY;

  for (const startIndex of candidatesStart) {
    const remaining = [...located];
    const order: T[] = [];
    let current: GeoPoint;
    if (startIndex === null) {
      current = partida as GeoPoint;
    } else {
      const [first] = remaining.splice(startIndex, 1);
      order.push(first);
      current = pt(first);
    }
    while (remaining.length) {
      let nearest = 0;
      let nearestKm = Number.POSITIVE_INFINITY;
      remaining.forEach((stop, index) => {
        const km = roadKm(current, pt(stop));
        if (km < nearestKm) {
          nearestKm = km;
          nearest = index;
        }
      });
      const [next] = remaining.splice(nearest, 1);
      order.push(next);
      current = pt(next);
    }
    const improved = twoOpt(order, partida, destino, pt);
    const km = routeDistanceKm(improved, partida, destino);
    if (km < bestKm) {
      bestKm = km;
      best = improved;
    }
  }

  return [...best, ...pending];
}

function twoOpt<T extends RouteStopInput>(
  order: T[],
  partida: GeoPoint | null,
  destino: GeoPoint | null,
  pt: (stop: T) => GeoPoint
) {
  let route = [...order];
  let improved = true;
  let guard = 0;
  while (improved && guard < 200) {
    improved = false;
    guard += 1;
    for (let i = 0; i < route.length - 1; i += 1) {
      for (let k = i + 1; k < route.length; k += 1) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        const currentKm = pathKm([...(partida ? [partida] : []), ...route.map(pt), ...(destino ? [destino] : [])]);
        const candidateKm = pathKm([...(partida ? [partida] : []), ...candidate.map(pt), ...(destino ? [destino] : [])]);
        if (candidateKm + 0.001 < currentKm) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
  return hours * 60 + minutes;
}

export function minutesToTime(total: number) {
  const normalized = ((Math.round(total) % 1440) + 1440) % 1440;
  const hours = Math.floor(normalized / 60);
  const minutes = normalized % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function travelMinutes(km: number, speedKmh: number) {
  return (km / Math.max(speedKmh, 1)) * 60;
}

/**
 * Calcula la hora de llegada a cada parada.
 * RECOGIDA: la llegada al destino es la hora objetivo; se calcula hacia atras.
 * RETORNO: la salida del destino es la hora objetivo; se calcula hacia adelante.
 * Las paradas sin coordenadas reciben el mismo tiempo de la parada anterior.
 */
export function computeSchedule(stops: RouteStopInput[], settings: RouteSettings): RouteSchedule {
  const legs: number[] = [];
  let previous: GeoPoint | null = settings.tipo === "RETORNO" ? settings.destino : settings.partida;

  stops.forEach((stop) => {
    if (hasCoords(stop) && previous) {
      const point = { lat: stop.lat as number, lng: stop.lng as number };
      legs.push(roadKm(previous, point));
      previous = point;
    } else {
      if (hasCoords(stop)) previous = { lat: stop.lat as number, lng: stop.lng as number };
      legs.push(0);
    }
  });

  const lastLeg =
    settings.tipo === "RECOGIDA" && previous && settings.destino ? roadKm(previous, settings.destino) : 0;

  // Minutos acumulados desde la primera parada (RECOGIDA) o desde la salida (RETORNO).
  const offsets: number[] = [];
  let elapsed = 0;
  stops.forEach((_, index) => {
    if (settings.tipo === "RECOGIDA") {
      if (index > 0) elapsed += settings.minutosPorParada + travelMinutes(legs[index], settings.velocidadKmh);
    } else {
      elapsed += travelMinutes(legs[index], settings.velocidadKmh) + (index > 0 ? settings.minutosPorParada : 0);
    }
    offsets.push(elapsed);
  });

  const distanciaKm = legs.reduce((sum, km) => sum + km, 0) + lastLeg;
  const objetivo = timeToMinutes(settings.horaObjetivo || "00:00");

  if (settings.tipo === "RECOGIDA") {
    const tailMinutes =
      (stops.length ? settings.minutosPorParada : 0) + travelMinutes(lastLeg, settings.velocidadKmh);
    const totalFromFirst = (offsets[offsets.length - 1] ?? 0) + tailMinutes;
    // Se redondea hacia abajo para que el personal nunca llegue tarde.
    const inicio = Math.floor(objetivo - totalFromFirst);
    return {
      horaInicio: minutesToTime(inicio),
      horaFin: minutesToTime(objetivo),
      distanciaKm,
      duracionMin: Math.ceil(totalFromFirst),
      paradas: stops.map((stop, index) => ({
        key: stop.key,
        minutosDesdeInicio: Math.round(offsets[index]),
        hora: minutesToTime(inicio + offsets[index]),
        tramoKm: legs[index]
      }))
    };
  }

  const duracion = (offsets[offsets.length - 1] ?? 0) + (stops.length ? settings.minutosPorParada : 0);
  return {
    horaInicio: minutesToTime(objetivo),
    horaFin: minutesToTime(objetivo + duracion),
    distanciaKm,
    duracionMin: Math.ceil(duracion),
    paradas: stops.map((stop, index) => ({
      key: stop.key,
      minutosDesdeInicio: Math.round(offsets[index]),
      hora: minutesToTime(objetivo + offsets[index]),
      tramoKm: legs[index]
    }))
  };
}

/**
 * Divide las paradas entre varios vehiculos respetando la capacidad.
 * Barrido angular alrededor del destino (o centroide) y luego optimizacion
 * del orden dentro de cada grupo.
 */
export function splitByCapacity<T extends RouteStopInput>(
  stops: T[],
  capacidad: number,
  partida: GeoPoint | null,
  destino: GeoPoint | null
): T[][] {
  const located = stops.filter(hasCoords);
  const pending = stops.filter((stop) => !hasCoords(stop));
  if (capacidad <= 0 || !located.length) return [stops];

  const center: GeoPoint =
    destino ??
    partida ?? {
      lat: located.reduce((sum, stop) => sum + (stop.lat as number), 0) / located.length,
      lng: located.reduce((sum, stop) => sum + (stop.lng as number), 0) / located.length
    };

  const angle = (stop: T) => Math.atan2((stop.lat as number) - center.lat, (stop.lng as number) - center.lng);
  const sorted = [...located].sort((a, b) => angle(a) - angle(b));

  // Empieza el barrido en el mayor hueco angular para no partir un grupo cercano.
  let startIndex = 0;
  let maxGap = -1;
  sorted.forEach((stop, index) => {
    const next = sorted[(index + 1) % sorted.length];
    let gap = angle(next) - angle(stop);
    if (gap < 0) gap += Math.PI * 2;
    if (gap > maxGap) {
      maxGap = gap;
      startIndex = (index + 1) % sorted.length;
    }
  });
  const rotated = [...sorted.slice(startIndex), ...sorted.slice(0, startIndex)];

  const groups: T[][] = [];
  let current: T[] = [];
  let load = 0;
  rotated.forEach((stop) => {
    const people = Math.max(stop.pasajeros, 0);
    if (current.length && load + people > capacidad) {
      groups.push(current);
      current = [];
      load = 0;
    }
    current.push(stop);
    load += people;
  });
  if (current.length) groups.push(current);
  if (pending.length) groups[groups.length - 1] = [...groups[groups.length - 1], ...pending];

  return groups.map((group) => optimizeStopOrder(group, partida, destino));
}

/** Extrae coordenadas de "lat,lng" o de un enlace de Google Maps. */
export function parseCoordinates(text: string): GeoPoint | null {
  const value = decodeURIComponent(text.trim());
  const patterns = [
    /@(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /[?&](?:q|query|ll|destination|daddr)=(-?\d{1,2}\.\d+),\s*(-?\d{1,3}\.\d+)/,
    /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/,
    /^(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)$/
  ];
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match) {
      const lat = Number(match[1]);
      const lng = Number(match[2]);
      if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) return { lat, lng };
    }
  }
  return null;
}

/**
 * Enlace de navegacion de Google Maps con las paradas como puntos intermedios.
 * Google Maps admite hasta 9 puntos intermedios en enlaces; si hay mas, se
 * generan varios tramos.
 */
export function buildGoogleMapsLinks(
  points: Array<{ lat: number | null; lng: number | null; nombre?: string; direccion?: string | null }>,
  origin: GeoPoint | null,
  destination: GeoPoint | null
) {
  const asText = (point: { lat: number | null; lng: number | null; nombre?: string; direccion?: string | null }) =>
    hasCoords(point) ? `${point.lat},${point.lng}` : point.direccion || point.nombre || "";

  const sequence = [
    ...(origin ? [`${origin.lat},${origin.lng}`] : []),
    ...points.map(asText).filter(Boolean),
    ...(destination ? [`${destination.lat},${destination.lng}`] : [])
  ];
  if (!sequence.length) return [];
  if (sequence.length === 1) {
    return [`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(sequence[0])}&travelmode=driving`];
  }

  const links: string[] = [];
  const maxPerLeg = 11; // origen + 9 intermedios + destino
  let start = 0;
  while (start < sequence.length - 1) {
    const chunk = sequence.slice(start, start + maxPerLeg);
    const params = new URLSearchParams({ api: "1", travelmode: "driving" });
    params.set("origin", chunk[0]);
    params.set("destination", chunk[chunk.length - 1]);
    if (chunk.length > 2) params.set("waypoints", chunk.slice(1, -1).join("|"));
    links.push(`https://www.google.com/maps/dir/?${params.toString()}`);
    start += maxPerLeg - 1;
  }
  return links;
}

export function buildNavigationLink(point: { lat: number | null; lng: number | null; direccion?: string | null; nombre?: string }) {
  const destination = hasCoords(point) ? `${point.lat},${point.lng}` : point.direccion || point.nombre || "";
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}&travelmode=driving`;
}
