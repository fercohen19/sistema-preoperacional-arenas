"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCurrentAppUser } from "@/lib/current-user";
import { buildGoogleMapsLinks, buildNavigationLink } from "@/lib/route-optimizer";
import {
  addDays,
  addMinutesToTime,
  dayLabel,
  friendlyDbError,
  hhmm,
  loadCurrentDriverId,
  loadServicesBetween,
  ROUTE_COLUMNS,
  STOP_COLUMNS,
  STOP_LOG_COLUMNS,
  todayBogota,
  weekDays,
  weekRangeLabel,
  weekStartOf,
  type RouteRecord,
  type RouteStopRecord,
  type ServiceRecord,
  type StopLogRecord
} from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { StatusPill } from "./status-pill";

function nowBogotaMinutes() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return get("hour") * 60 + get("minute");
}

function toMinutes(time: string) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function describeCountdown(target: number, now: number) {
  const diff = target - now;
  if (diff > 90) return `en ${Math.floor(diff / 60)} h ${diff % 60} min`;
  if (diff > 0) return `en ${diff} min`;
  if (diff === 0) return "ahora";
  const late = Math.abs(diff);
  return late > 90 ? `hace ${Math.floor(late / 60)} h ${late % 60} min` : `hace ${late} min`;
}

async function readPosition(): Promise<GeolocationPosition | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 30000
    });
  });
}

export function DriverServicesPanel({ compact = false }: { compact?: boolean }) {
  const { user, loading } = useCurrentAppUser();
  const today = todayBogota();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartOf(today));
  const [selectedDay, setSelectedDay] = useState(today);
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [plates, setPlates] = useState<Record<string, string>>({});
  const [routes, setRoutes] = useState<Record<string, RouteRecord>>({});
  const [stops, setStops] = useState<Record<string, RouteStopRecord[]>>({});
  const [logs, setLogs] = useState<StopLogRecord[]>([]);
  const [preopDone, setPreopDone] = useState<boolean | null>(null);
  const [now, setNow] = useState(nowBogotaMinutes);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});

  useEffect(() => {
    const timer = window.setInterval(() => setNow(nowBogotaMinutes()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (loading) return;
    void (async () => {
      const id = await loadCurrentDriverId(user?.documento ?? "");
      setDriverId(id);
      if (!id) {
        setIsLoading(false);
        setMessage({ tone: "danger", text: "Tu usuario no esta asociado a un conductor registrado." });
        return;
      }
      if (supabase) {
        const { data } = await supabase
          .from("inspecciones_preoperacionales")
          .select("id")
          .eq("conductor_id", id)
          .eq("fecha_operacion", today)
          .eq("cerrada", true)
          .limit(1);
        setPreopDone(Boolean(data?.length));
      }
    })();
  }, [loading, today, user?.documento]);

  const load = useCallback(async () => {
    if (!driverId || !supabase) return;
    setIsLoading(true);
    const { data, error } = await loadServicesBetween(weekStart, addDays(weekStart, 6), driverId);
    if (error) {
      setMessage({ tone: "danger", text: error });
      setIsLoading(false);
      return;
    }
    setServices(data);

    const vehicleIds = [...new Set(data.map((service) => service.vehiculo_id).filter(Boolean))] as string[];
    const routeIds = [...new Set(data.map((service) => service.ruta_id).filter(Boolean))] as string[];
    const serviceIds = data.map((service) => service.id);

    const [vehiclesResult, routesResult, stopsResult, logsResult] = await Promise.all([
      vehicleIds.length ? supabase.from("vehiculos").select("id, placa").in("id", vehicleIds) : Promise.resolve({ data: [] }),
      routeIds.length ? supabase.from("rutas").select(ROUTE_COLUMNS).in("id", routeIds) : Promise.resolve({ data: [] }),
      routeIds.length
        ? supabase.from("ruta_paradas").select(STOP_COLUMNS).in("ruta_id", routeIds).order("orden")
        : Promise.resolve({ data: [] }),
      serviceIds.length
        ? supabase.from("servicio_parada_registros").select(STOP_LOG_COLUMNS).in("servicio_id", serviceIds)
        : Promise.resolve({ data: [] })
    ]);

    setPlates(Object.fromEntries(((vehiclesResult.data ?? []) as Array<{ id: string; placa: string }>).map((row) => [row.id, row.placa])));
    setRoutes(Object.fromEntries(((routesResult.data ?? []) as RouteRecord[]).map((route) => [route.id, route])));
    const grouped: Record<string, RouteStopRecord[]> = {};
    ((stopsResult.data ?? []) as RouteStopRecord[]).forEach((stop) => {
      grouped[stop.ruta_id] = [...(grouped[stop.ruta_id] ?? []), stop];
    });
    setStops(grouped);
    setLogs((logsResult.data ?? []) as StopLogRecord[]);
    setIsLoading(false);
  }, [driverId, weekStart]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = services.filter((service) => service.estado !== "CANCELADO");
  const weekStats = {
    asignados: active.length,
    completados: active.filter((service) => service.estado === "COMPLETADO").length,
    pendientes: active.filter((service) => service.estado === "PROGRAMADO" || service.estado === "EN_CURSO").length,
    hoy: active.filter((service) => service.fecha === today).length
  };

  const dayServices = useMemo(
    () => services.filter((service) => service.fecha === (compact ? today : selectedDay)),
    [compact, selectedDay, services, today]
  );

  const changeStatus = async (service: ServiceRecord, estado: "EN_CURSO" | "COMPLETADO") => {
    if (!supabase) return;
    setBusy(service.id);
    const { data, error } = await supabase.rpc("conductor_actualizar_servicio", {
      p_servicio_id: service.id,
      p_estado: estado,
      p_observacion: notes[service.id] ?? null
    });
    setBusy("");
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    const updated = (Array.isArray(data) ? data[0] : data) as ServiceRecord;
    setServices((current) => current.map((item) => (item.id === service.id ? { ...item, ...updated } : item)));
    setMessage({ tone: "ok", text: estado === "EN_CURSO" ? "Servicio iniciado. Buen viaje." : "Servicio finalizado y contado en tu semana." });
  };

  const registerStop = async (service: ServiceRecord, stop: RouteStopRecord, estado: "RECOGIDO" | "NO_SE_PRESENTO") => {
    if (!supabase) return;
    setBusy(`${service.id}-${stop.id}`);
    if (service.estado === "PROGRAMADO") {
      await changeStatus(service, "EN_CURSO");
      setBusy(`${service.id}-${stop.id}`);
    }
    const position = await readPosition();
    const { data, error } = await supabase
      .from("servicio_parada_registros")
      .upsert(
        {
          servicio_id: service.id,
          parada_id: stop.id,
          parada_nombre: stop.nombre,
          orden: stop.orden,
          estado,
          registrado_at: new Date().toISOString(),
          pasajeros_abordo: estado === "RECOGIDO" ? stop.pasajeros : 0,
          lat: position ? Number(position.coords.latitude.toFixed(6)) : null,
          lng: position ? Number(position.coords.longitude.toFixed(6)) : null,
          precision_m: position ? Math.round(position.coords.accuracy) : null
        },
        { onConflict: "servicio_id,parada_id" }
      )
      .select(STOP_LOG_COLUMNS)
      .single();
    setBusy("");
    if (error || !data) {
      setMessage({ tone: "danger", text: friendlyDbError(error?.message) });
      return;
    }
    const saved = data as StopLogRecord;
    setLogs((current) => [...current.filter((log) => log.id !== saved.id && !(log.servicio_id === service.id && log.parada_id === stop.id)), saved]);
    const diff = saved.minutos_diferencia;
    setMessage({
      tone: "ok",
      text:
        estado === "RECOGIDO"
          ? `Recogida registrada en ${stop.nombre}${diff !== null ? ` (${diff > 0 ? `${diff} min tarde` : diff < 0 ? `${Math.abs(diff)} min antes` : "a tiempo"})` : ""}.`
          : `Se registro que nadie se presento en ${stop.nombre}.`
    });
  };

  if (loading || (isLoading && !services.length && !message)) {
    return <p className="muted">Cargando tus servicios...</p>;
  }

  return (
    <div className="stack-lg">
      {preopDone === false && weekStats.hoy > 0 ? (
        <p className="admin-alert admin-alert--warn">
          Tienes {weekStats.hoy} servicio(s) hoy y aun no has cerrado el preoperacional del dia.{" "}
          <Link href="/conductor" style={{ fontWeight: 700, textDecoration: "underline" }}>
            Hacerlo ahora
          </Link>
        </p>
      ) : null}

      <div className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Hoy</p>
          <p className="stat-value">{weekStats.hoy}</p>
          <p className="muted">Servicios para hoy</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Esta semana</p>
          <p className="stat-value">{weekStats.asignados}</p>
          <p className="muted">Servicios asignados</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Realizados</p>
          <p className="stat-value">{weekStats.completados}</p>
          <div className="progress">
            <span style={{ width: `${weekStats.asignados ? (weekStats.completados / weekStats.asignados) * 100 : 0}%` }} />
          </div>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Pendientes</p>
          <p className="stat-value">{weekStats.pendientes}</p>
          <p className="muted">Por realizar en la semana</p>
        </article>
      </div>

      {message ? <p className={message.tone === "danger" ? "admin-alert admin-alert--danger" : "admin-alert"}>{message.text}</p> : null}

      {!compact ? (
        <>
          <div className="toolbar">
            <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} type="button">
              ‹
            </button>
            <span className="week-label">{weekRangeLabel(weekStart)}</span>
            <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} type="button">
              ›
            </button>
            <button
              className="ghost-button small-button"
              onClick={() => {
                setWeekStart(weekStartOf(today));
                setSelectedDay(today);
              }}
              type="button"
            >
              Hoy
            </button>
          </div>
          <div className="day-strip">
            {weekDays(weekStart).map((day) => {
              const label = dayLabel(day);
              const count = active.filter((service) => service.fecha === day).length;
              return (
                <button
                  className={`day-pill${day === selectedDay ? " is-active" : ""}${day === today ? " is-today" : ""}`}
                  key={day}
                  onClick={() => setSelectedDay(day)}
                  type="button"
                >
                  {label.corto}
                  <strong>{label.numero}</strong>
                  <em>{count ? `${count} serv.` : "—"}</em>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {dayServices.length === 0 ? (
        <div className="empty-state">
          <strong>Sin servicios {compact || selectedDay === today ? "para hoy" : "este dia"}</strong>
          <span>Cuando administracion te asigne un servicio aparecera aqui con su hora y ruta.</span>
        </div>
      ) : (
        dayServices.map((service) => {
          const route = service.ruta_id ? routes[service.ruta_id] : undefined;
          const routeStops = service.ruta_id ? stops[service.ruta_id] ?? [] : [];
          const serviceLogs = logs.filter((log) => log.servicio_id === service.id);
          const isToday = service.fecha === today;
          const pendingStops = routeStops.filter((stop) => !serviceLogs.some((log) => log.parada_id === stop.id));
          const nextStop = pendingStops[0];
          const startMin = toMinutes(hhmm(service.hora_inicio));
          const finished = service.estado === "COMPLETADO" || service.estado === "CANCELADO";
          const mapsLinks = route
            ? buildGoogleMapsLinks(
                pendingStops.length ? pendingStops : routeStops,
                null,
                route.tipo === "RECOGIDA" && route.destino_lat !== null && route.destino_lng !== null
                  ? { lat: Number(route.destino_lat), lng: Number(route.destino_lng) }
                  : null
              )
            : [];

          return (
            <article className={service.estado === "EN_CURSO" ? "driver-service is-live" : "driver-service"} key={service.id}>
              <div className="driver-service__head">
                <div className="stack-sm">
                  <span className="driver-service__time">
                    {hhmm(service.hora_inicio)}
                    {service.hora_fin ? <span className="muted" style={{ fontSize: "1rem" }}> – {hhmm(service.hora_fin)}</span> : null}
                  </span>
                  <h3>{service.titulo}</h3>
                  <div className="action-row">
                    {service.vehiculo_id ? <span className="chip">🚐 {plates[service.vehiculo_id] ?? "Vehiculo"}</span> : null}
                    {service.pasajeros ? <span className="chip">👥 {service.pasajeros} pasajeros</span> : null}
                    {service.cliente ? <span className="chip">{service.cliente}</span> : null}
                  </div>
                </div>
                <div className="stack-sm" style={{ justifyItems: "end" }}>
                  <StatusPill value={service.estado} />
                  {isToday && service.estado === "PROGRAMADO" ? (
                    <span className="countdown muted">{describeCountdown(startMin, now)}</span>
                  ) : null}
                </div>
              </div>

              {service.origen || service.destino ? (
                <p className="muted">
                  {service.origen ? <>Recogida: <strong>{service.origen}</strong></> : null}
                  {service.origen && service.destino ? " → " : null}
                  {service.destino ? <>Destino: <strong>{service.destino}</strong></> : null}
                </p>
              ) : null}
              {service.descripcion ? <p className="banner" style={{ margin: 0 }}>{service.descripcion}</p> : null}

              {routeStops.length ? (
                <ol className="timeline">
                  {routeStops.map((stop) => {
                    const log = serviceLogs.find((item) => item.parada_id === stop.id);
                    const scheduled = addMinutesToTime(hhmm(service.hora_inicio), stop.minutos_desde_inicio);
                    const isNext = !finished && nextStop?.id === stop.id;
                    const stateClass = log ? (log.estado === "RECOGIDO" ? " is-done" : " is-missed") : isNext ? " is-next" : "";
                    return (
                      <li className={`timeline__item${stateClass}`} data-step={stop.orden} key={stop.id}>
                        <div className="timeline__row">
                          <div>
                            <span className="timeline__time">{scheduled}</span> · <strong>{stop.nombre}</strong>
                            <p className="muted">
                              {stop.direccion || "Sin direccion"} · {stop.pasajeros} persona(s)
                            </p>
                            {stop.personal ? <p className="muted">Personal: {stop.personal}</p> : null}
                          </div>
                          {log ? (
                            <div className="action-row">
                              <StatusPill value={log.estado} />
                              {log.minutos_diferencia !== null ? (
                                <span className={`status-pill ${log.minutos_diferencia > (route?.tolerancia_minutos ?? 5) ? "status-pill--danger" : "status-pill--ok"}`}>
                                  {log.minutos_diferencia > 0 ? `+${log.minutos_diferencia}` : log.minutos_diferencia} min
                                </span>
                              ) : null}
                            </div>
                          ) : isNext && isToday ? (
                            <span className="countdown" style={{ color: toMinutes(scheduled) < now ? "var(--danger)" : "var(--sea)" }}>
                              {describeCountdown(toMinutes(scheduled), now)}
                            </span>
                          ) : null}
                        </div>
                        {!finished && isToday ? (
                          <div className="action-row">
                            <a className="ghost-button small-button" href={buildNavigationLink(stop)} rel="noreferrer" target="_blank">
                              Ir
                            </a>
                            <button
                              className="primary-button success-button small-button"
                              disabled={busy === `${service.id}-${stop.id}`}
                              onClick={() => void registerStop(service, stop, "RECOGIDO")}
                              type="button"
                            >
                              {log?.estado === "RECOGIDO" ? "Actualizar recogida" : "Recogido"}
                            </button>
                            <button
                              className="danger-button small-button"
                              disabled={busy === `${service.id}-${stop.id}`}
                              onClick={() => void registerStop(service, stop, "NO_SE_PRESENTO")}
                              type="button"
                            >
                              No se presento
                            </button>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                  {route?.destino_nombre && route.tipo === "RECOGIDA" ? (
                    <li className="timeline__item" data-step="🏁">
                      <span>
                        <span className="timeline__time">{hhmm(service.hora_fin) || hhmm(route.hora_objetivo)}</span> · Llegada a{" "}
                        <strong>{route.destino_nombre}</strong>
                      </span>
                    </li>
                  ) : null}
                </ol>
              ) : null}

              {!finished ? (
                <div className="stack-sm">
                  {isToday && service.estado === "EN_CURSO" ? (
                    <textarea
                      className="text-area"
                      onChange={(event) => setNotes({ ...notes, [service.id]: event.target.value })}
                      placeholder="Novedades del servicio (opcional)"
                      rows={2}
                      value={notes[service.id] ?? ""}
                    />
                  ) : null}
                  <div className="action-row">
                    {mapsLinks.map((link, index) => (
                      <a className="secondary-button small-button" href={link} key={link} rel="noreferrer" target="_blank">
                        {mapsLinks.length > 1 ? `Ruta en Maps (tramo ${index + 1})` : "Abrir ruta en Google Maps"}
                      </a>
                    ))}
                    {!route && (service.origen || service.destino) ? (
                      <a
                        className="secondary-button small-button"
                        href={buildNavigationLink({ lat: null, lng: null, direccion: service.estado === "EN_CURSO" ? service.destino : service.origen ?? service.destino })}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Navegar
                      </a>
                    ) : null}
                    <span className="spacer" />
                    {isToday && service.estado === "PROGRAMADO" ? (
                      <button className="primary-button small-button" disabled={busy === service.id} onClick={() => void changeStatus(service, "EN_CURSO")} type="button">
                        Iniciar servicio
                      </button>
                    ) : null}
                    {isToday && service.estado === "EN_CURSO" ? (
                      <button className="primary-button success-button small-button" disabled={busy === service.id} onClick={() => void changeStatus(service, "COMPLETADO")} type="button">
                        Finalizar servicio
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : service.observaciones_conductor ? (
                <p className="muted">Novedades: {service.observaciones_conductor}</p>
              ) : null}
            </article>
          );
        })
      )}

      {compact ? (
        <Link className="ghost-button" href="/conductor/servicios">
          Ver toda mi semana
        </Link>
      ) : null}
    </div>
  );
}
