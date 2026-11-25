"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildGoogleMapsLinks,
  computeSchedule,
  hasCoords,
  optimizeStopOrder,
  parseCoordinates,
  routeDistanceKm,
  splitByCapacity,
  type GeoPoint,
  type RouteSettings
} from "@/lib/route-optimizer";
import {
  friendlyDbError,
  hhmm,
  loadFleetOptions,
  ROUTE_COLUMNS,
  STOP_COLUMNS,
  type RouteRecord,
  type RouteStopRecord,
  type VehicleOption
} from "@/lib/services";
import { supabase } from "@/lib/supabase";

type StopDraft = {
  key: string;
  id: string | null;
  nombre: string;
  direccion: string;
  coordsText: string;
  lat: number | null;
  lng: number | null;
  pasajeros: number;
  personal: string;
};

type RouteDraft = {
  id: string | null;
  nombre: string;
  cliente: string;
  descripcion: string;
  tipo: "RECOGIDA" | "RETORNO";
  partidaNombre: string;
  partidaText: string;
  destinoNombre: string;
  destinoText: string;
  horaObjetivo: string;
  velocidad: string;
  minutosParada: string;
  tolerancia: string;
  activa: boolean;
  stops: StopDraft[];
};

let keySeed = 0;
const newKey = () => `n${Date.now().toString(36)}${(keySeed += 1)}`;

const coordsLabel = (lat: number | null, lng: number | null) =>
  lat !== null && lng !== null ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : "";

const emptyRoute = (): RouteDraft => ({
  id: null,
  nombre: "",
  cliente: "",
  descripcion: "",
  tipo: "RECOGIDA",
  partidaNombre: "",
  partidaText: "",
  destinoNombre: "",
  destinoText: "",
  horaObjetivo: "06:00",
  velocidad: "25",
  minutosParada: "2",
  tolerancia: "5",
  activa: true,
  stops: []
});

const emptyStop = (): StopDraft => ({
  key: newKey(),
  id: null,
  nombre: "",
  direccion: "",
  coordsText: "",
  lat: null,
  lng: null,
  pasajeros: 1,
  personal: ""
});

function routeToDraft(route: RouteRecord, stops: RouteStopRecord[]): RouteDraft {
  return {
    id: route.id,
    nombre: route.nombre,
    cliente: route.cliente ?? "",
    descripcion: route.descripcion ?? "",
    tipo: route.tipo,
    partidaNombre: route.partida_nombre ?? "",
    partidaText: coordsLabel(route.partida_lat, route.partida_lng),
    destinoNombre: route.destino_nombre ?? "",
    destinoText: coordsLabel(route.destino_lat, route.destino_lng),
    horaObjetivo: hhmm(route.hora_objetivo) || "06:00",
    velocidad: String(route.velocidad_promedio_kmh ?? 25),
    minutosParada: String(route.minutos_por_parada ?? 2),
    tolerancia: String(route.tolerancia_minutos ?? 5),
    activa: route.activa,
    stops: stops
      .sort((a, b) => a.orden - b.orden)
      .map((stop) => ({
        key: stop.id,
        id: stop.id,
        nombre: stop.nombre,
        direccion: stop.direccion ?? "",
        coordsText: coordsLabel(stop.lat, stop.lng),
        lat: stop.lat === null ? null : Number(stop.lat),
        lng: stop.lng === null ? null : Number(stop.lng),
        pasajeros: stop.pasajeros,
        personal: stop.personal ?? ""
      }))
  };
}

async function geocode(query: string): Promise<GeoPoint | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=co&accept-language=es&q=${encodeURIComponent(query)}`;
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) return null;
  const rows = (await response.json()) as Array<{ lat: string; lon: string }>;
  return rows[0] ? { lat: Number(Number(rows[0].lat).toFixed(6)), lng: Number(Number(rows[0].lon).toFixed(6)) } : null;
}

export function RoutesAdminPanel() {
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [draft, setDraft] = useState<RouteDraft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [geocoding, setGeocoding] = useState("");
  const [lastOptimization, setLastOptimization] = useState<{ before: number; after: number } | null>(null);
  const [capacityVehicle, setCapacityVehicle] = useState("");
  const [splitCapacity, setSplitCapacity] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  const loadRoutes = useCallback(async () => {
    if (!supabase) {
      setMessage({ tone: "danger", text: "Supabase no esta configurado." });
      setIsLoading(false);
      return;
    }
    const { data, error } = await supabase.from("rutas").select(ROUTE_COLUMNS).order("activa", { ascending: false }).order("nombre");
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message) });
    setRoutes((data ?? []) as RouteRecord[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadRoutes();
    void loadFleetOptions().then((fleet) => setVehicles(fleet.vehicles));
  }, [loadRoutes]);

  const openRoute = async (route: RouteRecord) => {
    if (!supabase) return;
    const { data, error } = await supabase.from("ruta_paradas").select(STOP_COLUMNS).eq("ruta_id", route.id).order("orden");
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    setDraft(routeToDraft(route, (data ?? []) as RouteStopRecord[]));
    setLastOptimization(null);
    setMessage(null);
  };

  const partida = useMemo(() => (draft ? parseCoordinates(draft.partidaText) : null), [draft]);
  const destino = useMemo(() => (draft ? parseCoordinates(draft.destinoText) : null), [draft]);

  const settings: RouteSettings | null = useMemo(
    () =>
      draft
        ? {
            tipo: draft.tipo,
            partida,
            destino,
            horaObjetivo: draft.horaObjetivo,
            velocidadKmh: Number(draft.velocidad) || 25,
            minutosPorParada: Number(draft.minutosParada) || 0
          }
        : null,
    [destino, draft, partida]
  );

  const schedule = useMemo(() => (draft && settings ? computeSchedule(draft.stops, settings) : null), [draft, settings]);
  const totalPassengers = draft?.stops.reduce((sum, stop) => sum + (Number(stop.pasajeros) || 0), 0) ?? 0;
  const missingCoords = draft?.stops.filter((stop) => !hasCoords(stop)).length ?? 0;
  const selectedCapacity = vehicles.find((vehicle) => vehicle.id === capacityVehicle)?.capacidad ?? null;

  const groups = useMemo(() => {
    const capacity = Number(splitCapacity);
    if (!draft || !capacity || capacity <= 0) return [];
    const start = draft.tipo === "RETORNO" ? destino : partida;
    const end = draft.tipo === "RECOGIDA" ? destino : null;
    return splitByCapacity(draft.stops, capacity, start, end).map((group) => ({
      stops: group,
      pasajeros: group.reduce((sum, stop) => sum + stop.pasajeros, 0),
      schedule: computeSchedule(group, settings as RouteSettings)
    }));
  }, [destino, draft, partida, settings, splitCapacity]);

  const updateStop = (key: string, patch: Partial<StopDraft>) => {
    if (!draft) return;
    setDraft({ ...draft, stops: draft.stops.map((stop) => (stop.key === key ? { ...stop, ...patch } : stop)) });
  };

  const moveStop = (index: number, delta: number) => {
    if (!draft) return;
    const next = [...draft.stops];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setDraft({ ...draft, stops: next });
  };

  const optimize = () => {
    if (!draft) return;
    const start = draft.tipo === "RETORNO" ? destino : partida;
    const end = draft.tipo === "RECOGIDA" ? destino : null;
    const before = routeDistanceKm(draft.stops, start, end);
    const ordered = optimizeStopOrder(draft.stops, start, end);
    const after = routeDistanceKm(ordered, start, end);
    setDraft({ ...draft, stops: ordered });
    setLastOptimization({ before, after });
    setMessage({
      tone: missingCoords ? "warn" : "ok",
      text:
        after + 0.05 < before
          ? `Orden optimizado: ${before.toFixed(1)} km → ${after.toFixed(1)} km. Revisa y guarda la ruta.`
          : "El orden actual ya es el mas corto encontrado." +
            (missingCoords ? ` ${missingCoords} parada(s) sin coordenadas quedaron al final.` : "")
    });
  };

  const geocodeStop = async (stop: StopDraft) => {
    const query = stop.direccion || stop.nombre;
    if (!query) return false;
    setGeocoding(stop.key);
    try {
      const point = await geocode(`${query}, Atlantico, Colombia`);
      if (point) {
        updateStop(stop.key, { lat: point.lat, lng: point.lng, coordsText: coordsLabel(point.lat, point.lng) });
        return true;
      }
      setMessage({ tone: "warn", text: `No se encontro "${query}". Pega el enlace o las coordenadas desde Google Maps.` });
    } catch {
      setMessage({ tone: "warn", text: "El buscador de direcciones no respondio. Pega las coordenadas desde Google Maps." });
    } finally {
      setGeocoding("");
    }
    return false;
  };

  const geocodeAll = async () => {
    if (!draft) return;
    let found = 0;
    const pending = draft.stops.filter((stop) => !hasCoords(stop) && (stop.direccion || stop.nombre));
    for (const stop of pending) {
      // El servicio publico de OpenStreetMap admite una consulta por segundo.
      if (found > 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      setGeocoding(stop.key);
      try {
        const point = await geocode(`${stop.direccion || stop.nombre}, Atlantico, Colombia`);
        if (point) {
          found += 1;
          setDraft((current) =>
            current
              ? {
                  ...current,
                  stops: current.stops.map((item) =>
                    item.key === stop.key ? { ...item, lat: point.lat, lng: point.lng, coordsText: coordsLabel(point.lat, point.lng) } : item
                  )
                }
              : current
          );
        }
      } catch {
        break;
      }
    }
    setGeocoding("");
    setMessage({ tone: found === pending.length ? "ok" : "warn", text: `Se ubicaron ${found} de ${pending.length} parada(s). Verifica en el mapa que queden bien.` });
  };

  const captureLocation = (apply: (point: GeoPoint) => void) => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => apply({ lat: Number(position.coords.latitude.toFixed(6)), lng: Number(position.coords.longitude.toFixed(6)) }),
      () => setMessage({ tone: "warn", text: "No fue posible leer la ubicacion del dispositivo." }),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const persistRoute = async (routeDraft: RouteDraft, routeSchedule: ReturnType<typeof computeSchedule>) => {
    if (!supabase) throw new Error("Supabase no esta configurado.");
    const p = parseCoordinates(routeDraft.partidaText);
    const d = parseCoordinates(routeDraft.destinoText);
    const routeRow = {
      nombre: routeDraft.nombre.trim(),
      cliente: routeDraft.cliente.trim() || null,
      descripcion: routeDraft.descripcion.trim() || null,
      tipo: routeDraft.tipo,
      partida_nombre: routeDraft.partidaNombre.trim() || null,
      partida_lat: p?.lat ?? null,
      partida_lng: p?.lng ?? null,
      destino_nombre: routeDraft.destinoNombre.trim() || null,
      destino_lat: d?.lat ?? null,
      destino_lng: d?.lng ?? null,
      hora_objetivo: routeDraft.horaObjetivo || null,
      velocidad_promedio_kmh: Number(routeDraft.velocidad) || 25,
      minutos_por_parada: Number(routeDraft.minutosParada) || 0,
      tolerancia_minutos: Number(routeDraft.tolerancia) || 0,
      distancia_estimada_km: Number(routeSchedule.distanciaKm.toFixed(2)),
      duracion_estimada_min: routeSchedule.duracionMin,
      activa: routeDraft.activa,
      updated_at: new Date().toISOString()
    };

    const routeResult = routeDraft.id
      ? await supabase.from("rutas").update(routeRow).eq("id", routeDraft.id).select(ROUTE_COLUMNS).single()
      : await supabase.from("rutas").insert(routeRow).select(ROUTE_COLUMNS).single();
    if (routeResult.error || !routeResult.data) throw new Error(friendlyDbError(routeResult.error?.message));
    const saved = routeResult.data as RouteRecord;

    const keepIds = routeDraft.stops.map((stop) => stop.id).filter(Boolean) as string[];
    if (routeDraft.id) {
      let deleteQuery = supabase.from("ruta_paradas").delete().eq("ruta_id", saved.id);
      if (keepIds.length) deleteQuery = deleteQuery.not("id", "in", `(${keepIds.join(",")})`);
      const { error } = await deleteQuery;
      if (error) throw new Error(friendlyDbError(error.message));
    }

    const offsets = new Map(routeSchedule.paradas.map((stop) => [stop.key, stop.minutosDesdeInicio]));
    const stopRow = (stop: StopDraft, index: number) => ({
      ruta_id: saved.id,
      orden: index + 1,
      nombre: stop.nombre.trim() || `Parada ${index + 1}`,
      direccion: stop.direccion.trim() || null,
      lat: stop.lat,
      lng: stop.lng,
      pasajeros: Number(stop.pasajeros) || 0,
      personal: stop.personal.trim() || null,
      minutos_desde_inicio: Math.max(offsets.get(stop.key) ?? 0, 0),
      updated_at: new Date().toISOString()
    });
    const existingRows = routeDraft.stops
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop }) => stop.id)
      .map(({ stop, index }) => ({ id: stop.id as string, ...stopRow(stop, index) }));
    const newRows = routeDraft.stops
      .map((stop, index) => ({ stop, index }))
      .filter(({ stop }) => !stop.id)
      .map(({ stop, index }) => stopRow(stop, index));

    // La restriccion de orden es diferida: el reordenamiento se valida al final de cada sentencia.
    if (existingRows.length) {
      const { error } = await supabase.from("ruta_paradas").upsert(existingRows, { onConflict: "id" });
      if (error) throw new Error(friendlyDbError(error.message));
    }
    let insertedStops: RouteStopRecord[] = [];
    if (newRows.length) {
      const { data, error } = await supabase.from("ruta_paradas").insert(newRows).select(STOP_COLUMNS);
      if (error) throw new Error(friendlyDbError(error.message));
      insertedStops = (data ?? []) as RouteStopRecord[];
    }
    return { saved, insertedStops };
  };

  const save = async () => {
    if (!draft || !schedule) return;
    if (!draft.nombre.trim()) {
      setMessage({ tone: "danger", text: "Ponle un nombre a la ruta." });
      return;
    }
    if (!draft.stops.length) {
      setMessage({ tone: "danger", text: "Agrega al menos una parada." });
      return;
    }
    setIsSaving(true);
    try {
      const { saved } = await persistRoute(draft, schedule);
      await loadRoutes();
      await openRoute(saved);
      setMessage({
        tone: "ok",
        text: `Ruta guardada. Los servicios que usan esta ruta ya muestran los nuevos horarios a los conductores. Inicio sugerido ${schedule.horaInicio}.`
      });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "No fue posible guardar." });
    } finally {
      setIsSaving(false);
    }
  };

  const saveGroupsAsRoutes = async () => {
    if (!draft || !groups.length || !settings) return;
    if (!window.confirm(`Se crearan ${groups.length} rutas nuevas a partir de "${draft.nombre || "esta ruta"}". La ruta original no se modifica. Continuar?`)) return;
    setIsSaving(true);
    try {
      for (const [index, group] of groups.entries()) {
        await persistRoute(
          {
            ...draft,
            id: null,
            nombre: `${draft.nombre || "Ruta"} - Vehiculo ${index + 1}`,
            stops: group.stops.map((stop) => ({ ...stop, id: null, key: stop.key }))
          },
          group.schedule
        );
      }
      await loadRoutes();
      setMessage({ tone: "ok", text: `${groups.length} rutas creadas. Asignalas a los vehiculos desde Servicios.` });
    } catch (error) {
      setMessage({ tone: "danger", text: error instanceof Error ? error.message : "No fue posible crear las rutas." });
    } finally {
      setIsSaving(false);
    }
  };

  const removeRoute = async () => {
    if (!supabase || !draft?.id) return;
    if (!window.confirm("Eliminar la ruta y sus paradas? Los servicios que la usaban quedaran sin ruta. Si solo quieres dejar de usarla, desmarca 'Ruta activa'.")) return;
    const { error } = await supabase.from("rutas").delete().eq("id", draft.id);
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    setDraft(null);
    await loadRoutes();
    setMessage({ tone: "ok", text: "Ruta eliminada." });
  };

  const scheduleByKey = new Map(schedule?.paradas.map((stop) => [stop.key, stop]) ?? []);
  const mapsLinks = draft
    ? buildGoogleMapsLinks(draft.stops, draft.tipo === "RETORNO" ? destino : partida, draft.tipo === "RECOGIDA" ? destino : null)
    : [];

  return (
    <div className="routes-layout">
      <aside className="route-list">
        <button
          className="primary-button"
          onClick={() => {
            setDraft({ ...emptyRoute(), stops: [emptyStop()] });
            setLastOptimization(null);
            setMessage(null);
          }}
          type="button"
        >
          + Nueva ruta
        </button>
        {isLoading ? <p className="muted">Cargando rutas...</p> : null}
        {!isLoading && !routes.length ? <p className="muted">Aun no hay rutas creadas.</p> : null}
        {routes.map((route) => (
          <button
            className={draft?.id === route.id ? "route-list__item is-active" : "route-list__item"}
            key={route.id}
            onClick={() => void openRoute(route)}
            type="button"
          >
            <strong>{route.nombre}</strong>
            <span className="muted">
              {route.tipo === "RECOGIDA" ? "Llegada" : "Salida"} {hhmm(route.hora_objetivo) || "--:--"}
              {route.distancia_estimada_km ? ` · ${Number(route.distancia_estimada_km).toFixed(1)} km` : ""}
              {route.duracion_estimada_min ? ` · ${route.duracion_estimada_min} min` : ""}
            </span>
            {!route.activa ? <span className="muted">Inactiva</span> : null}
          </button>
        ))}
      </aside>

      <section className="stack-lg">
        {message ? (
          <p className={`admin-alert ${message.tone === "danger" ? "admin-alert--danger" : message.tone === "warn" ? "admin-alert--warn" : ""}`}>
            {message.text}
          </p>
        ) : null}

        {!draft ? (
          <div className="empty-state">
            <strong>Selecciona una ruta o crea una nueva</strong>
            <span>
              Define el punto de partida, las paradas donde se recoge al personal y el destino. El sistema ordena las paradas por
              menor recorrido y calcula a que hora pasar por cada una.
            </span>
          </div>
        ) : (
          <>
            <article className="table-card stack-md">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">{draft.id ? "Editar ruta" : "Nueva ruta"}</p>
                  <h2>{draft.nombre || "Ruta sin nombre"}</h2>
                </div>
                <div className="action-row">
                  {draft.id ? (
                    <button className="danger-button small-button" onClick={() => void removeRoute()} type="button">
                      Eliminar
                    </button>
                  ) : null}
                  <button className="primary-button" disabled={isSaving} onClick={() => void save()} type="button">
                    {isSaving ? "Guardando..." : "Guardar ruta"}
                  </button>
                </div>
              </div>

              <div className="form-grid">
                <label className="field span-2">
                  <span>Nombre</span>
                  <input onChange={(event) => setDraft({ ...draft, nombre: event.target.value })} placeholder="Ej: Ruta Soledad - Planta turno A" value={draft.nombre} />
                </label>
                <label className="field">
                  <span>Cliente</span>
                  <input onChange={(event) => setDraft({ ...draft, cliente: event.target.value })} value={draft.cliente} />
                </label>
                <label className="field">
                  <span>Tipo</span>
                  <select className="select-field" onChange={(event) => setDraft({ ...draft, tipo: event.target.value as RouteDraft["tipo"] })} value={draft.tipo}>
                    <option value="RECOGIDA">Recogida (llevar personal al destino)</option>
                    <option value="RETORNO">Retorno (repartir desde el destino)</option>
                  </select>
                </label>
                <label className="field">
                  <span>{draft.tipo === "RECOGIDA" ? "Hora de llegada al destino" : "Hora de salida del destino"}</span>
                  <input onChange={(event) => setDraft({ ...draft, horaObjetivo: event.target.value })} type="time" value={draft.horaObjetivo} />
                </label>
                <label className="field">
                  <span>Tolerancia de puntualidad (min)</span>
                  <input inputMode="numeric" onChange={(event) => setDraft({ ...draft, tolerancia: event.target.value })} value={draft.tolerancia} />
                </label>

                <label className="field">
                  <span>Punto de partida del vehiculo</span>
                  <input onChange={(event) => setDraft({ ...draft, partidaNombre: event.target.value })} placeholder="Ej: Parqueadero Arenas" value={draft.partidaNombre} />
                </label>
                <label className="field span-2">
                  <span>Coordenadas o enlace de Google Maps (partida)</span>
                  <div className="action-row" style={{ flexWrap: "nowrap" }}>
                    <input className="input" onChange={(event) => setDraft({ ...draft, partidaText: event.target.value })} placeholder="10.9639, -74.7964" value={draft.partidaText} />
                    <button className="icon-button" onClick={() => captureLocation((point) => setDraft({ ...draft, partidaText: coordsLabel(point.lat, point.lng) }))} title="Usar mi ubicacion" type="button">
                      📍
                    </button>
                  </div>
                  <span className="field-hint">{partida ? "✓ Ubicacion valida" : draft.partidaText ? "No se reconocen coordenadas" : "Opcional, mejora el calculo"}</span>
                </label>

                <label className="field">
                  <span>Destino</span>
                  <input onChange={(event) => setDraft({ ...draft, destinoNombre: event.target.value })} placeholder="Ej: Planta Zona Franca" value={draft.destinoNombre} />
                </label>
                <label className="field span-2">
                  <span>Coordenadas o enlace de Google Maps (destino)</span>
                  <div className="action-row" style={{ flexWrap: "nowrap" }}>
                    <input className="input" onChange={(event) => setDraft({ ...draft, destinoText: event.target.value })} placeholder="10.9420, -74.7820" value={draft.destinoText} />
                    <button className="icon-button" onClick={() => captureLocation((point) => setDraft({ ...draft, destinoText: coordsLabel(point.lat, point.lng) }))} title="Usar mi ubicacion" type="button">
                      📍
                    </button>
                  </div>
                  <span className="field-hint">{destino ? "✓ Ubicacion valida" : "Necesario para calcular la hora de llegada"}</span>
                </label>

                <label className="field">
                  <span>Velocidad promedio (km/h)</span>
                  <input inputMode="decimal" onChange={(event) => setDraft({ ...draft, velocidad: event.target.value })} value={draft.velocidad} />
                  <span className="field-hint">Ciudad en hora pico: 18-25 km/h</span>
                </label>
                <label className="field">
                  <span>Minutos por parada</span>
                  <input inputMode="numeric" onChange={(event) => setDraft({ ...draft, minutosParada: event.target.value })} value={draft.minutosParada} />
                </label>
                <label className="field" style={{ alignContent: "center" }}>
                  <span>Estado</span>
                  <label className="check-option" style={{ justifySelf: "start" }}>
                    <input checked={draft.activa} onChange={(event) => setDraft({ ...draft, activa: event.target.checked })} type="checkbox" />
                    Ruta activa
                  </label>
                </label>
              </div>
            </article>

            {schedule ? (
              <div className="metric-strip">
                <div className="metric">
                  <span>{draft.tipo === "RECOGIDA" ? "Salir a primera parada" : "Salida"}</span>
                  <strong>{schedule.horaInicio}</strong>
                </div>
                <div className="metric">
                  <span>{draft.tipo === "RECOGIDA" ? "Llegada destino" : "Ultima entrega"}</span>
                  <strong>{schedule.horaFin}</strong>
                </div>
                <div className="metric">
                  <span>Distancia estimada</span>
                  <strong>{schedule.distanciaKm.toFixed(1)} km</strong>
                  {lastOptimization && lastOptimization.after + 0.05 < lastOptimization.before ? (
                    <small>−{(lastOptimization.before - lastOptimization.after).toFixed(1)} km optimizado</small>
                  ) : null}
                </div>
                <div className="metric">
                  <span>Duracion</span>
                  <strong>{schedule.duracionMin} min</strong>
                </div>
                <div className="metric">
                  <span>Pasajeros</span>
                  <strong>{totalPassengers}</strong>
                  {selectedCapacity ? (
                    <small style={{ color: totalPassengers > selectedCapacity ? "var(--danger)" : undefined }}>
                      {totalPassengers > selectedCapacity ? `Excede capacidad (${selectedCapacity})` : `Cabe en ${selectedCapacity} puestos`}
                    </small>
                  ) : null}
                </div>
              </div>
            ) : null}

            <article className="table-card stack-md">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Paradas</p>
                  <h2>Orden de recogida y horarios</h2>
                  <p className="muted">
                    Pega en cada parada el enlace o las coordenadas de Google Maps, o usa “Ubicar” para buscar la direccion.
                    {missingCoords ? ` ${missingCoords} parada(s) sin ubicacion.` : ""}
                  </p>
                </div>
                <div className="action-row">
                  <button className="ghost-button small-button" disabled={Boolean(geocoding) || !missingCoords} onClick={() => void geocodeAll()} type="button">
                    {geocoding ? "Ubicando..." : "Ubicar todas"}
                  </button>
                  <button className="accent-button primary-button small-button" disabled={draft.stops.length < 2} onClick={optimize} type="button">
                    ⚡ Optimizar orden
                  </button>
                </div>
              </div>

              <div className="stop-table">
                {draft.stops.map((stop, index) => {
                  const scheduled = scheduleByKey.get(stop.key);
                  return (
                    <div className="stop-row" key={stop.key}>
                      <span className="stop-index">{index + 1}</span>
                      <div className="stack-sm stop-wide">
                        <input className="input" onChange={(event) => updateStop(stop.key, { nombre: event.target.value })} placeholder="Nombre de la parada" value={stop.nombre} />
                        <input className="input" onChange={(event) => updateStop(stop.key, { direccion: event.target.value })} placeholder="Direccion" value={stop.direccion} />
                        <input className="input" onChange={(event) => updateStop(stop.key, { personal: event.target.value })} placeholder="Personal que sube (opcional)" value={stop.personal} />
                      </div>
                      <div className="stack-sm stop-wide">
                        <input
                          className="input"
                          onChange={(event) => {
                            const point = parseCoordinates(event.target.value);
                            updateStop(stop.key, { coordsText: event.target.value, lat: point?.lat ?? null, lng: point?.lng ?? null });
                          }}
                          placeholder="Coordenadas / enlace Maps"
                          value={stop.coordsText}
                        />
                        <div className="action-row">
                          <span className={hasCoords(stop) ? "status-pill status-pill--ok" : "status-pill status-pill--warn"}>
                            {hasCoords(stop) ? "Ubicada" : "Sin ubicar"}
                          </span>
                          <button className="ghost-button small-button" disabled={geocoding === stop.key} onClick={() => void geocodeStop(stop)} type="button">
                            {geocoding === stop.key ? "..." : "Ubicar"}
                          </button>
                          <button
                            className="icon-button"
                            onClick={() => captureLocation((point) => updateStop(stop.key, { lat: point.lat, lng: point.lng, coordsText: coordsLabel(point.lat, point.lng) }))}
                            title="Usar mi ubicacion"
                            type="button"
                          >
                            📍
                          </button>
                        </div>
                      </div>
                      <label className="field">
                        <span>Pers.</span>
                        <input className="input" inputMode="numeric" onChange={(event) => updateStop(stop.key, { pasajeros: Number(event.target.value.replace(/\D/g, "")) || 0 })} value={stop.pasajeros} />
                      </label>
                      <div className="stop-time" title="Hora estimada de paso">
                        {scheduled?.hora ?? "--:--"}
                        {scheduled && scheduled.tramoKm > 0 ? <div className="muted" style={{ fontSize: "0.75rem", fontWeight: 600 }}>{scheduled.tramoKm.toFixed(1)} km</div> : null}
                      </div>
                      <div className="stop-actions">
                        <button className="icon-button" disabled={index === 0} onClick={() => moveStop(index, -1)} title="Subir" type="button">
                          ↑
                        </button>
                        <button className="icon-button" disabled={index === draft.stops.length - 1} onClick={() => moveStop(index, 1)} title="Bajar" type="button">
                          ↓
                        </button>
                        <button className="icon-button" onClick={() => setDraft({ ...draft, stops: draft.stops.filter((item) => item.key !== stop.key) })} title="Quitar" type="button">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="action-row">
                <button className="secondary-button small-button" onClick={() => setDraft({ ...draft, stops: [...draft.stops, emptyStop()] })} type="button">
                  + Agregar parada
                </button>
                {mapsLinks.map((link, index) => (
                  <a className="ghost-button small-button" href={link} key={link} rel="noreferrer" target="_blank">
                    Ver en Google Maps{mapsLinks.length > 1 ? ` (tramo ${index + 1})` : ""}
                  </a>
                ))}
              </div>
            </article>

            <article className="table-card stack-md">
              <div>
                <p className="eyebrow">Mapa esquematico</p>
                <h2>Recorrido en el orden actual</h2>
                <p className="muted">Lineas rectas entre puntos; para el trazado por calles usa “Ver en Google Maps”.</p>
              </div>
              <RouteSketch destino={destino} partida={partida} stops={draft.stops} tipo={draft.tipo} />
            </article>

            <article className="table-card stack-md">
              <div className="section-title-row">
                <div>
                  <p className="eyebrow">Recursos</p>
                  <h2>Capacidad y division en vehiculos</h2>
                  <p className="muted">
                    Si el personal no cabe en un vehiculo, el sistema agrupa las paradas cercanas por capacidad y calcula cada
                    sub-ruta.
                  </p>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>Vehiculo de referencia</span>
                  <select
                    className="select-field"
                    onChange={(event) => {
                      setCapacityVehicle(event.target.value);
                      const capacity = vehicles.find((vehicle) => vehicle.id === event.target.value)?.capacidad;
                      if (capacity) setSplitCapacity(String(capacity));
                    }}
                    value={capacityVehicle}
                  >
                    <option value="">Elegir vehiculo</option>
                    {vehicles.map((vehicle) => (
                      <option key={vehicle.id} value={vehicle.id}>
                        {vehicle.placa} · {vehicle.capacidad ?? "?"} puestos
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Capacidad por vehiculo</span>
                  <input inputMode="numeric" onChange={(event) => setSplitCapacity(event.target.value.replace(/\D/g, ""))} placeholder="Ej: 15" value={splitCapacity} />
                </label>
                <div className="field">
                  <span>Resultado</span>
                  <strong style={{ paddingTop: 10 }}>
                    {groups.length ? `${groups.length} vehiculo(s) para ${totalPassengers} personas` : "Indica la capacidad"}
                  </strong>
                </div>
              </div>
              {groups.length > 1 ? (
                <>
                  <div className="grid-two two-columns">
                    {groups.map((group, index) => (
                      <div className="group-card stack-sm" key={group.stops.map((stop) => stop.key).join("-")}>
                        <strong>
                          Vehiculo {index + 1} · {group.pasajeros} personas
                        </strong>
                        <span className="muted">
                          {group.schedule.horaInicio} → {group.schedule.horaFin} · {group.schedule.distanciaKm.toFixed(1)} km · {group.schedule.duracionMin} min
                        </span>
                        <ol style={{ margin: 0, paddingLeft: 18 }}>
                          {group.stops.map((stop) => (
                            <li key={stop.key}>
                              {stop.nombre || "Parada sin nombre"} <span className="muted">({stop.pasajeros})</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                    ))}
                  </div>
                  <div className="action-row">
                    <button className="secondary-button" disabled={isSaving} onClick={() => void saveGroupsAsRoutes()} type="button">
                      Crear {groups.length} rutas con esta division
                    </button>
                  </div>
                </>
              ) : groups.length === 1 ? (
                <p className="admin-alert">Todo el personal cabe en un solo vehiculo; no es necesario dividir la ruta.</p>
              ) : null}
            </article>
          </>
        )}
      </section>
    </div>
  );
}

function RouteSketch({
  stops,
  partida,
  destino,
  tipo
}: {
  stops: StopDraft[];
  partida: GeoPoint | null;
  destino: GeoPoint | null;
  tipo: "RECOGIDA" | "RETORNO";
}) {
  const located = stops
    .map((stop, index) => ({ stop, index }))
    .filter(({ stop }) => hasCoords(stop))
    .map(({ stop, index }) => ({ lat: stop.lat as number, lng: stop.lng as number, label: String(index + 1), name: stop.nombre }));
  const start = tipo === "RETORNO" ? destino : partida;
  const end = tipo === "RECOGIDA" ? destino : null;
  const all = [...(partida ? [partida] : []), ...(destino ? [destino] : []), ...located];

  if (all.length < 2) {
    return <div className="empty-state">Ubica al menos dos puntos para ver el recorrido.</div>;
  }

  const width = 760;
  const height = 380;
  const pad = 36;
  const lats = all.map((point) => point.lat);
  const lngs = all.map((point) => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const spanLng = Math.max(maxLng - minLng, 0.002);
  const spanLat = Math.max(maxLat - minLat, 0.002);
  const scale = Math.min((width - pad * 2) / spanLng, (height - pad * 2) / spanLat);
  const offsetX = (width - spanLng * scale) / 2;
  const offsetY = (height - spanLat * scale) / 2;
  const project = (point: GeoPoint) => ({
    x: offsetX + (point.lng - minLng) * scale,
    y: height - (offsetY + (point.lat - minLat) * scale)
  });

  const path = [...(start ? [start] : []), ...located, ...(end ? [end] : [])].map(project);

  return (
    <svg className="route-map" role="img" viewBox={`0 0 ${width} ${height}`}>
      <title>Recorrido esquematico de la ruta</title>
      <polyline fill="none" points={path.map((p) => `${p.x},${p.y}`).join(" ")} stroke="#24557f" strokeDasharray="2 0" strokeLinejoin="round" strokeWidth={3} />
      {path.slice(1).map((point, index) => {
        const prev = path[index];
        const mx = (prev.x + point.x) / 2;
        const my = (prev.y + point.y) / 2;
        const angle = (Math.atan2(point.y - prev.y, point.x - prev.x) * 180) / Math.PI;
        return <polygon fill="#24557f" key={`a${index}`} points="-5,-4 5,0 -5,4" transform={`translate(${mx} ${my}) rotate(${angle})`} />;
      })}
      {partida ? (
        <g transform={`translate(${project(partida).x} ${project(partida).y})`}>
          <rect fill="#0f2438" height={18} rx={4} width={18} x={-9} y={-9} />
          <text fill="#fff" fontSize={10} fontWeight={800} textAnchor="middle" y={4}>
            P
          </text>
        </g>
      ) : null}
      {destino ? (
        <g transform={`translate(${project(destino).x} ${project(destino).y})`}>
          <circle fill="#e6ae2e" r={13} stroke="#0f2438" strokeWidth={2} />
          <text fill="#0f2438" fontSize={12} fontWeight={800} textAnchor="middle" y={4}>
            D
          </text>
        </g>
      ) : null}
      {located.map((point) => {
        const p = project(point);
        return (
          <g key={point.label} transform={`translate(${p.x} ${p.y})`}>
            <circle fill="#0d8a8f" r={11} stroke="#fff" strokeWidth={2} />
            <text fill="#fff" fontSize={10} fontWeight={800} textAnchor="middle" y={3.5}>
              {point.label}
            </text>
            {point.name ? (
              <text fill="#15212d" fontSize={10.5} x={14} y={4}>
                {point.name.slice(0, 22)}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
