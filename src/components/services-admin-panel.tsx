"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { contractRecords } from "@/lib/contracts";
import { useCurrentAppUser } from "@/lib/current-user";
import { parseCalendarFile, type CalendarOccurrence } from "@/lib/ics-import";
import { addMinutesToTime } from "@/lib/services";
import {
  addDays,
  dayLabel,
  findConflicts,
  formatShortDate,
  friendlyDbError,
  hhmm,
  loadFleetOptions,
  loadServicesBetween,
  ROUTE_COLUMNS,
  SERVICE_COLUMNS,
  SERVICE_STATUS_LABEL,
  summarizeByDriver,
  todayBogota,
  weekDays,
  weekRangeLabel,
  weekStartOf,
  type DriverOption,
  type RouteRecord,
  type ServiceRecord,
  type ServiceStatus,
  type VehicleOption
} from "@/lib/services";
import { supabase } from "@/lib/supabase";
import { StatusPill } from "./status-pill";

type Tab = "agenda" | "resumen" | "importar";

type Draft = {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  titulo: string;
  cliente: string;
  contrato_referencia: string;
  origen: string;
  destino: string;
  pasajeros: string;
  descripcion: string;
  ruta_id: string;
  vehiculo_id: string;
  conductor_id: string;
  estado: ServiceStatus;
};

const emptyDraft = (fecha: string): Draft => ({
  id: "",
  fecha,
  hora_inicio: "06:00",
  hora_fin: "",
  titulo: "",
  cliente: "",
  contrato_referencia: "",
  origen: "",
  destino: "",
  pasajeros: "",
  descripcion: "",
  ruta_id: "",
  vehiculo_id: "",
  conductor_id: "",
  estado: "PROGRAMADO"
});

function draftFromService(service: ServiceRecord): Draft {
  return {
    id: service.id,
    fecha: service.fecha,
    hora_inicio: hhmm(service.hora_inicio),
    hora_fin: hhmm(service.hora_fin),
    titulo: service.titulo,
    cliente: service.cliente ?? "",
    contrato_referencia: service.contrato_referencia ?? "",
    origen: service.origen ?? "",
    destino: service.destino ?? "",
    pasajeros: service.pasajeros?.toString() ?? "",
    descripcion: service.descripcion ?? "",
    ruta_id: service.ruta_id ?? "",
    vehiculo_id: service.vehiculo_id ?? "",
    conductor_id: service.conductor_id ?? "",
    estado: service.estado
  };
}

function draftToRow(draft: Draft) {
  return {
    fecha: draft.fecha,
    hora_inicio: draft.hora_inicio,
    hora_fin: draft.hora_fin || null,
    titulo: draft.titulo.trim(),
    cliente: draft.cliente.trim() || null,
    contrato_referencia: draft.contrato_referencia.trim() || null,
    origen: draft.origen.trim() || null,
    destino: draft.destino.trim() || null,
    pasajeros: draft.pasajeros.trim() ? Number(draft.pasajeros) : null,
    descripcion: draft.descripcion.trim() || null,
    ruta_id: draft.ruta_id || null,
    vehiculo_id: draft.vehiculo_id || null,
    conductor_id: draft.conductor_id || null,
    estado: draft.estado,
    updated_at: new Date().toISOString()
  };
}

export function ServicesAdminPanel() {
  const { user } = useCurrentAppUser();
  const [tab, setTab] = useState<Tab>("agenda");
  const [weekStart, setWeekStart] = useState(() => weekStartOf(todayBogota()));
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverOption[]>([]);
  const [vehicles, setVehicles] = useState<VehicleOption[]>([]);
  const [routes, setRoutes] = useState<RouteRecord[]>([]);
  const [filterDriver, setFilterDriver] = useState("");
  const [filterVehicle, setFilterVehicle] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const today = todayBogota();
  const days = useMemo(() => weekDays(weekStart), [weekStart]);

  const loadWeek = useCallback(async () => {
    setIsLoading(true);
    const { data, error } = await loadServicesBetween(weekStart, addDays(weekStart, 6));
    setServices(data);
    if (error) setMessage({ tone: "danger", text: error });
    setIsLoading(false);
  }, [weekStart]);

  useEffect(() => {
    void loadWeek();
  }, [loadWeek]);

  useEffect(() => {
    async function loadCatalogs() {
      const fleet = await loadFleetOptions();
      setDrivers(fleet.drivers);
      setVehicles(fleet.vehicles);
      if (supabase) {
        const { data } = await supabase.from("rutas").select(ROUTE_COLUMNS).eq("activa", true).order("nombre");
        setRoutes((data ?? []) as RouteRecord[]);
      }
    }
    void loadCatalogs();
  }, []);

  const driverName = useCallback(
    (id: string | null) => drivers.find((driver) => driver.id === id)?.nombre_completo ?? "Sin conductor",
    [drivers]
  );
  const vehiclePlate = useCallback(
    (id: string | null) => vehicles.find((vehicle) => vehicle.id === id)?.placa ?? "Sin vehiculo",
    [vehicles]
  );

  const visibleServices = useMemo(
    () =>
      services.filter(
        (service) =>
          (!filterDriver || (filterDriver === "NONE" ? !service.conductor_id : service.conductor_id === filterDriver)) &&
          (!filterVehicle || service.vehiculo_id === filterVehicle)
      ),
    [filterDriver, filterVehicle, services]
  );

  const stats = useMemo(() => {
    const active = services.filter((service) => service.estado !== "CANCELADO");
    return {
      total: active.length,
      completados: active.filter((service) => service.estado === "COMPLETADO").length,
      sinAsignar: active.filter((service) => !service.conductor_id || !service.vehiculo_id).length,
      hoy: active.filter((service) => service.fecha === today).length
    };
  }, [services, today]);

  const conflicts = useMemo(() => {
    if (!draft) return [];
    return findConflicts(
      {
        id: draft.id,
        fecha: draft.fecha,
        hora_inicio: draft.hora_inicio,
        hora_fin: draft.hora_fin || null,
        conductor_id: draft.conductor_id || null,
        vehiculo_id: draft.vehiculo_id || null,
        estado: draft.estado
      },
      services
    );
  }, [draft, services]);

  const capacityWarning = useMemo(() => {
    if (!draft?.vehiculo_id || !draft.pasajeros) return "";
    const capacity = vehicles.find((vehicle) => vehicle.id === draft.vehiculo_id)?.capacidad;
    return capacity && Number(draft.pasajeros) > capacity
      ? `El vehiculo tiene capacidad para ${capacity} pasajeros y el servicio indica ${draft.pasajeros}.`
      : "";
  }, [draft, vehicles]);

  const applyRoute = (routeId: string) => {
    if (!draft) return;
    const route = routes.find((item) => item.id === routeId);
    if (!route) {
      setDraft({ ...draft, ruta_id: "" });
      return;
    }
    const next: Draft = { ...draft, ruta_id: routeId };
    if (!next.titulo) next.titulo = route.nombre;
    if (!next.cliente && route.cliente) next.cliente = route.cliente;
    if (route.tipo === "RECOGIDA") {
      if (route.destino_nombre) next.destino = route.destino_nombre;
    } else if (route.destino_nombre) {
      next.origen = route.destino_nombre;
    }
    if (route.hora_objetivo && route.duracion_estimada_min) {
      const objetivo = hhmm(route.hora_objetivo);
      if (route.tipo === "RECOGIDA") {
        next.hora_inicio = addMinutesToTime(objetivo, -route.duracion_estimada_min);
        next.hora_fin = objetivo;
      } else {
        next.hora_inicio = objetivo;
        next.hora_fin = addMinutesToTime(objetivo, route.duracion_estimada_min);
      }
    }
    setDraft(next);
  };

  const applyContract = (value: string) => {
    if (!draft) return;
    const contract = contractRecords.find((item) => item.numeroContrato === value.trim().padStart(4, "0"));
    setDraft({
      ...draft,
      contrato_referencia: value,
      cliente: draft.cliente || contract?.nombreSuscritoContrato || "",
      origen: draft.origen || contract?.lugarRecogida || "",
      titulo: draft.titulo || contract?.detalleRecorrido || ""
    });
  };

  const saveDraft = async () => {
    if (!supabase || !draft) return;
    if (!draft.titulo.trim() || !draft.fecha || !draft.hora_inicio) {
      setMessage({ tone: "danger", text: "Completa fecha, hora de inicio y nombre del servicio." });
      return;
    }
    if (draft.hora_fin && draft.hora_fin <= draft.hora_inicio) {
      setMessage({ tone: "danger", text: "La hora final debe ser mayor que la hora de inicio." });
      return;
    }
    setIsSaving(true);
    const row = draftToRow(draft);
    const result = draft.id
      ? await supabase.from("servicios").update(row).eq("id", draft.id).select(SERVICE_COLUMNS).single()
      : await supabase
          .from("servicios")
          .insert({ ...row, origen_registro: "MANUAL" })
          .select(SERVICE_COLUMNS)
          .single();
    setIsSaving(false);

    if (result.error || !result.data) {
      setMessage({ tone: "danger", text: friendlyDbError(result.error?.message) });
      return;
    }
    const saved = result.data as ServiceRecord;
    setServices((current) =>
      [...current.filter((service) => service.id !== saved.id), saved].sort((a, b) =>
        `${a.fecha}${a.hora_inicio}`.localeCompare(`${b.fecha}${b.hora_inicio}`)
      )
    );
    setDraft(null);
    setMessage({ tone: "ok", text: draft.id ? "Servicio actualizado." : "Servicio agendado y visible para el conductor." });
  };

  const deleteService = async () => {
    if (!supabase || !draft?.id) return;
    if (!window.confirm("Eliminar este servicio definitivamente? Si ya se presto, mejor marcalo como cancelado.")) return;
    const { error } = await supabase.from("servicios").delete().eq("id", draft.id);
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    setServices((current) => current.filter((service) => service.id !== draft.id));
    setDraft(null);
    setMessage({ tone: "ok", text: "Servicio eliminado." });
  };

  const copyWeek = async () => {
    if (!supabase) return;
    const source = services.filter((service) => service.estado !== "CANCELADO");
    if (!source.length) return;
    if (!window.confirm(`Copiar ${source.length} servicio(s) a la semana siguiente con el mismo conductor y vehiculo?`)) return;
    let ok = 0;
    const errors: string[] = [];
    for (const service of source) {
      const { error } = await supabase.from("servicios").insert({
        ...draftToRow(draftFromService(service)),
        fecha: addDays(service.fecha, 7),
        estado: "PROGRAMADO",
        origen_registro: "MANUAL",
        creado_por: null
      });
      if (error) errors.push(`${service.titulo}: ${friendlyDbError(error.message)}`);
      else ok += 1;
    }
    setMessage({
      tone: errors.length ? "warn" : "ok",
      text: `${ok} servicio(s) copiados a la semana siguiente.${errors.length ? ` No se copiaron ${errors.length}: ${errors.slice(0, 3).join(" | ")}` : ""}`
    });
  };

  const summary = useMemo(() => summarizeByDriver(services), [services]);
  const vehicleUsage = useMemo(() => {
    const map = new Map<string, number>();
    services
      .filter((service) => service.estado !== "CANCELADO" && service.vehiculo_id)
      .forEach((service) => map.set(service.vehiculo_id as string, (map.get(service.vehiculo_id as string) ?? 0) + 1));
    return vehicles.map((vehicle) => ({ vehicle, count: map.get(vehicle.id) ?? 0 })).sort((a, b) => b.count - a.count);
  }, [services, vehicles]);

  return (
    <div className="stack-lg">
      <div className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Semana</p>
          <p className="stat-value">{stats.total}</p>
          <p className="muted">Servicios programados</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Hoy</p>
          <p className="stat-value">{stats.hoy}</p>
          <p className="muted">{formatShortDate(today)}</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Completados</p>
          <p className="stat-value">{stats.completados}</p>
          <p className="muted">Cerrados por el conductor</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Por asignar</p>
          <p className="stat-value" style={{ color: stats.sinAsignar ? "var(--coral-strong)" : undefined }}>
            {stats.sinAsignar}
          </p>
          <p className="muted">Sin conductor o vehiculo</p>
        </article>
      </div>

      {message ? (
        <p className={`admin-alert ${message.tone === "danger" ? "admin-alert--danger" : message.tone === "warn" ? "admin-alert--warn" : ""}`}>
          {message.text}
        </p>
      ) : null}

      <div className="tabs" role="tablist">
        {(
          [
            ["agenda", "Agenda semanal"],
            ["resumen", "Resumen por conductor"],
            ["importar", "Importar Google Calendar"]
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button className={tab === key ? "tab is-active" : "tab"} key={key} onClick={() => setTab(key)} role="tab" type="button">
            {label}
          </button>
        ))}
      </div>

      {tab !== "importar" ? (
        <div className="toolbar">
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, -7))} title="Semana anterior" type="button">
            ‹
          </button>
          <span className="week-label">{weekRangeLabel(weekStart)}</span>
          <button className="icon-button" onClick={() => setWeekStart(addDays(weekStart, 7))} title="Semana siguiente" type="button">
            ›
          </button>
          <button className="ghost-button small-button" onClick={() => setWeekStart(weekStartOf(today))} type="button">
            Hoy
          </button>
          {tab === "agenda" ? (
            <>
              <select className="select-field" onChange={(event) => setFilterDriver(event.target.value)} value={filterDriver}>
                <option value="">Todos los conductores</option>
                <option value="NONE">Sin conductor asignado</option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.nombre_completo}
                  </option>
                ))}
              </select>
              <select className="select-field" onChange={(event) => setFilterVehicle(event.target.value)} value={filterVehicle}>
                <option value="">Todos los vehiculos</option>
                {vehicles.map((vehicle) => (
                  <option key={vehicle.id} value={vehicle.id}>
                    {vehicle.placa}
                  </option>
                ))}
              </select>
            </>
          ) : null}
          <span className="spacer" />
          <button className="ghost-button small-button" disabled={!services.length} onClick={() => void copyWeek()} type="button">
            Copiar a semana siguiente
          </button>
          <button className="primary-button small-button" onClick={() => setDraft(emptyDraft(days.includes(today) ? today : weekStart))} type="button">
            + Nuevo servicio
          </button>
        </div>
      ) : null}

      {tab === "agenda" ? (
        isLoading ? (
          <p className="muted">Cargando agenda...</p>
        ) : (
          <div className="week-grid">
            {days.map((day) => {
              const label = dayLabel(day);
              const dayServices = visibleServices.filter((service) => service.fecha === day);
              return (
                <section className={day === today ? "day-column is-today" : "day-column"} key={day}>
                  <div className="day-column__head">
                    <strong>{label.dia}</strong>
                    <span className="day-number">{label.numero}</span>
                  </div>
                  {dayServices.map((service) => {
                    const unassigned = !service.conductor_id || !service.vehiculo_id;
                    return (
                      <button
                        className={`service-card service-card--${service.estado}${unassigned && service.estado === "PROGRAMADO" ? " service-card--unassigned" : ""}`}
                        key={service.id}
                        onClick={() => setDraft(draftFromService(service))}
                        type="button"
                      >
                        <span className="service-card__time">
                          {hhmm(service.hora_inicio)}
                          {service.hora_fin ? ` - ${hhmm(service.hora_fin)}` : ""}
                        </span>
                        <strong>{service.titulo}</strong>
                        <span className="muted">{driverName(service.conductor_id)}</span>
                        <span className="muted">
                          {vehiclePlate(service.vehiculo_id)}
                          {service.ruta_id ? " · Ruta" : ""}
                          {service.origen_registro === "GOOGLE_CALENDAR" ? " · Calendar" : ""}
                        </span>
                      </button>
                    );
                  })}
                  <button className="day-add" onClick={() => setDraft(emptyDraft(day))} type="button">
                    + Agregar
                  </button>
                </section>
              );
            })}
          </div>
        )
      ) : null}

      {tab === "resumen" ? (
        <div className="grid-two two-columns">
          <article className="table-card">
            <div className="table-card__header">
              <div>
                <p className="eyebrow">Conductores</p>
                <h2>Servicios de la semana</h2>
              </div>
            </div>
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Conductor</th>
                  <th>Asignados</th>
                  <th>Hechos</th>
                  <th>Avance</th>
                </tr>
              </thead>
              <tbody>
                {summary.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      Sin servicios esta semana.
                    </td>
                  </tr>
                ) : (
                  summary
                    .sort((a, b) => b.asignados - a.asignados)
                    .map((row) => (
                      <tr key={row.conductorId ?? "none"}>
                        <td>
                          <strong>{row.conductorId ? driverName(row.conductorId) : "Sin asignar"}</strong>
                          {row.cancelados ? <div className="muted">{row.cancelados} cancelado(s)</div> : null}
                        </td>
                        <td>{row.asignados}</td>
                        <td>{row.completados}</td>
                        <td>
                          <div className="progress" title={`${row.completados} de ${row.asignados}`}>
                            <span style={{ width: `${row.asignados ? (row.completados / row.asignados) * 100 : 0}%` }} />
                          </div>
                        </td>
                      </tr>
                    ))
                )}
              </tbody>
            </table>
          </article>
          <article className="table-card">
            <div className="table-card__header">
              <div>
                <p className="eyebrow">Recursos</p>
                <h2>Uso de vehiculos</h2>
              </div>
            </div>
            <table className="summary-table">
              <thead>
                <tr>
                  <th>Vehiculo</th>
                  <th>Capacidad</th>
                  <th>Servicios</th>
                </tr>
              </thead>
              <tbody>
                {vehicleUsage.map(({ vehicle, count }) => (
                  <tr key={vehicle.id}>
                    <td>
                      <strong>{vehicle.placa}</strong> <span className="muted">{vehicle.tipo_vehiculo}</span>
                    </td>
                    <td>{vehicle.capacidad ?? "-"}</td>
                    <td>{count === 0 ? <span className="status-pill status-pill--muted">Libre</span> : count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        </div>
      ) : null}

      {tab === "importar" ? (
        <CalendarImport
          drivers={drivers}
          onImported={(count) => {
            setMessage({ tone: "ok", text: `${count} servicio(s) importados desde Google Calendar. Asigna conductor y vehiculo en la agenda.` });
            setTab("agenda");
            void loadWeek();
          }}
          userDocument={user?.documento ?? ""}
          vehicles={vehicles}
        />
      ) : null}

      {draft ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setDraft(null)}>
          <aside aria-label="Servicio" className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{draft.id ? "Editar servicio" : "Nuevo servicio"}</p>
                <h2>{draft.titulo || "Servicio sin nombre"}</h2>
              </div>
              <button className="icon-button" onClick={() => setDraft(null)} type="button">
                ✕
              </button>
            </div>

            <div className="form-grid">
              <label className="field">
                <span>Fecha</span>
                <input onChange={(event) => setDraft({ ...draft, fecha: event.target.value })} type="date" value={draft.fecha} />
              </label>
              <label className="field">
                <span>Hora inicio</span>
                <input onChange={(event) => setDraft({ ...draft, hora_inicio: event.target.value })} type="time" value={draft.hora_inicio} />
              </label>
              <label className="field">
                <span>Hora fin</span>
                <input onChange={(event) => setDraft({ ...draft, hora_fin: event.target.value })} type="time" value={draft.hora_fin} />
              </label>
              <label className="field span-all">
                <span>Nombre del servicio</span>
                <input onChange={(event) => setDraft({ ...draft, titulo: event.target.value })} placeholder="Ej: Ruta personal planta - turno A" value={draft.titulo} />
              </label>
              <label className="field span-all">
                <span>Ruta predefinida (opcional)</span>
                <select className="select-field" onChange={(event) => applyRoute(event.target.value)} value={draft.ruta_id}>
                  <option value="">Sin ruta (servicio punto a punto)</option>
                  {routes.map((route) => (
                    <option key={route.id} value={route.id}>
                      {route.nombre} · {route.tipo === "RECOGIDA" ? "llegada" : "salida"} {hhmm(route.hora_objetivo)}
                    </option>
                  ))}
                </select>
                <span className="field-hint">Al elegir ruta se calculan las horas con el tiempo estimado del recorrido.</span>
              </label>
              <label className="field">
                <span>Conductor</span>
                <select className="select-field" onChange={(event) => setDraft({ ...draft, conductor_id: event.target.value })} value={draft.conductor_id}>
                  <option value="">Sin asignar</option>
                  {drivers.map((driver) => (
                    <option key={driver.id} value={driver.id}>
                      {driver.nombre_completo}
                      {driver.estado !== "ACTIVO" ? " (inactivo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Vehiculo</span>
                <select className="select-field" onChange={(event) => setDraft({ ...draft, vehiculo_id: event.target.value })} value={draft.vehiculo_id}>
                  <option value="">Sin asignar</option>
                  {vehicles.map((vehicle) => (
                    <option key={vehicle.id} value={vehicle.id}>
                      {vehicle.placa} · {vehicle.capacidad ?? "?"} pax
                      {vehicle.estado !== "ACTIVO" ? " (inactivo)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Pasajeros</span>
                <input inputMode="numeric" onChange={(event) => setDraft({ ...draft, pasajeros: event.target.value.replace(/\D/g, "") })} value={draft.pasajeros} />
              </label>
              <label className="field">
                <span>Contrato</span>
                <input list="contratos-servicio" onChange={(event) => applyContract(event.target.value)} placeholder="Ej: 0012" value={draft.contrato_referencia} />
                <datalist id="contratos-servicio">
                  {contractRecords.map((contract) => (
                    <option key={contract.numeroContrato} value={contract.numeroContrato}>
                      {contract.nombreSuscritoContrato}
                    </option>
                  ))}
                </datalist>
              </label>
              <label className="field span-2">
                <span>Cliente</span>
                <input onChange={(event) => setDraft({ ...draft, cliente: event.target.value })} value={draft.cliente} />
              </label>
              <label className="field span-2">
                <span>Origen / recogida</span>
                <input onChange={(event) => setDraft({ ...draft, origen: event.target.value })} value={draft.origen} />
              </label>
              <label className="field">
                <span>Estado</span>
                <select className="select-field" onChange={(event) => setDraft({ ...draft, estado: event.target.value as ServiceStatus })} value={draft.estado}>
                  {(Object.keys(SERVICE_STATUS_LABEL) as ServiceStatus[]).map((status) => (
                    <option key={status} value={status}>
                      {SERVICE_STATUS_LABEL[status]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field span-all">
                <span>Destino</span>
                <input onChange={(event) => setDraft({ ...draft, destino: event.target.value })} value={draft.destino} />
              </label>
              <label className="field span-all">
                <span>Indicaciones para el conductor</span>
                <textarea className="text-area" onChange={(event) => setDraft({ ...draft, descripcion: event.target.value })} rows={3} value={draft.descripcion} />
              </label>
            </div>

            {conflicts.length ? (
              <div className="conflict-box">
                <strong>Cruce de horario.</strong>{" "}
                {conflicts.map((service) => `${hhmm(service.hora_inicio)} ${service.titulo} (${driverName(service.conductor_id)} / ${vehiclePlate(service.vehiculo_id)})`).join("; ")}
                . La base de datos rechazara el guardado mientras exista el cruce.
              </div>
            ) : null}
            {capacityWarning ? <p className="admin-alert admin-alert--warn">{capacityWarning}</p> : null}

            <div className="action-row">
              <button className="primary-button" disabled={isSaving} onClick={() => void saveDraft()} type="button">
                {isSaving ? "Guardando..." : draft.id ? "Guardar cambios" : "Agendar servicio"}
              </button>
              <button className="ghost-button" onClick={() => setDraft(null)} type="button">
                Cerrar
              </button>
              <span className="spacer" />
              {draft.id ? (
                <button className="danger-button small-button" onClick={() => void deleteService()} type="button">
                  Eliminar
                </button>
              ) : null}
            </div>

            {draft.id ? <ServiceStopLog serviceId={draft.id} /> : null}
          </aside>
        </div>
      ) : null}
    </div>
  );
}

/** Puntualidad registrada por el conductor en cada parada. */
function ServiceStopLog({ serviceId }: { serviceId: string }) {
  const [rows, setRows] = useState<Array<{ id: string; parada_nombre: string; estado: string; registrado_at: string; hora_programada: string | null; minutos_diferencia: number | null }>>([]);

  useEffect(() => {
    async function load() {
      if (!supabase) return;
      const { data } = await supabase
        .from("servicio_parada_registros")
        .select("id, parada_nombre, estado, registrado_at, hora_programada, minutos_diferencia, orden")
        .eq("servicio_id", serviceId)
        .order("orden");
      setRows(data ?? []);
    }
    void load();
  }, [serviceId]);

  if (!rows.length) return null;
  return (
    <div className="stack-sm">
      <p className="eyebrow">Seguimiento de recogidas</p>
      {rows.map((row) => (
        <div className="table-row compact" key={row.id}>
          <div>
            <strong>{row.parada_nombre}</strong>
            <p className="muted">
              Programada {hhmm(row.hora_programada) || "-"} · Registrada{" "}
              {new Date(row.registrado_at).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" })}
            </p>
          </div>
          <div className="action-row">
            <StatusPill value={row.estado} />
            {row.minutos_diferencia !== null ? (
              <span className={`status-pill ${row.minutos_diferencia > 5 ? "status-pill--danger" : "status-pill--ok"}`}>
                {row.minutos_diferencia > 0 ? `+${row.minutos_diferencia}` : row.minutos_diferencia} min
              </span>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}

function CalendarImport({
  drivers,
  vehicles,
  onImported
}: {
  drivers: DriverOption[];
  vehicles: VehicleOption[];
  userDocument: string;
  onImported: (count: number) => void;
}) {
  const today = todayBogota();
  const [desde, setDesde] = useState(weekStartOf(today));
  const [hasta, setHasta] = useState(addDays(weekStartOf(today), 27));
  const [fileText, setFileText] = useState("");
  const [fileName, setFileName] = useState("");
  const [items, setItems] = useState<CalendarOccurrence[]>([]);
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [defaultDriver, setDefaultDriver] = useState("");
  const [defaultVehicle, setDefaultVehicle] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    async function parse() {
      if (!fileText) return;
      try {
        const parsed = parseCalendarFile(fileText, desde, hasta).filter((item) => !item.cancelado);
        setItems(parsed);
        setError(parsed.length ? "" : "No hay eventos en el rango de fechas elegido.");
        let known = new Set<string>();
        if (supabase && parsed.length) {
          const keys = parsed.map((item) => item.importKey);
          for (let index = 0; index < keys.length; index += 150) {
            const { data } = await supabase
              .from("servicios")
              .select("google_event_uid")
              .in("google_event_uid", keys.slice(index, index + 150));
            (data ?? []).forEach((row) => known.add(row.google_event_uid as string));
          }
        }
        known = new Set(known);
        setExisting(known);
        setSelected(new Set(parsed.filter((item) => !known.has(item.importKey)).map((item) => item.importKey)));
      } catch (parseError) {
        setError(parseError instanceof Error ? parseError.message : "No fue posible leer el archivo.");
      }
    }
    void parse();
  }, [desde, fileText, hasta]);

  const importSelected = async () => {
    if (!supabase) return;
    const rows = items
      .filter((item) => selected.has(item.importKey))
      .map((item) => ({
        fecha: item.fecha,
        hora_inicio: item.horaInicio,
        hora_fin: item.horaFin,
        titulo: item.titulo.slice(0, 200),
        descripcion: item.descripcion || null,
        origen: item.ubicacion ? item.ubicacion.slice(0, 250) : null,
        conductor_id: defaultDriver || null,
        vehiculo_id: defaultVehicle || null,
        estado: "PROGRAMADO",
        origen_registro: "GOOGLE_CALENDAR",
        google_event_uid: item.importKey.slice(0, 300)
      }));
    if (!rows.length) return;
    setIsImporting(true);
    setError("");
    let imported = 0;
    const failures: string[] = [];
    // Se insertan uno a uno para que un cruce de horario no detenga el resto.
    for (const row of rows) {
      const { error: insertError } = await supabase
        .from("servicios")
        .upsert(row, { onConflict: "google_event_uid", ignoreDuplicates: true });
      if (insertError) {
        // Reintenta sin asignacion si el problema fue un cruce.
        if (/Cruce de horario/.test(insertError.message) && (row.conductor_id || row.vehiculo_id)) {
          const retry = await supabase
            .from("servicios")
            .upsert({ ...row, conductor_id: null, vehiculo_id: null }, { onConflict: "google_event_uid", ignoreDuplicates: true });
          if (!retry.error) {
            imported += 1;
            continue;
          }
        }
        failures.push(`${row.fecha} ${row.titulo}: ${friendlyDbError(insertError.message)}`);
      } else {
        imported += 1;
      }
    }
    setIsImporting(false);
    if (failures.length) setError(`No se importaron ${failures.length}: ${failures.slice(0, 3).join(" | ")}`);
    if (imported) onImported(imported);
  };

  return (
    <div className="stack-md">
      <article className="banner">
        <strong>Como traer los servicios de Google Calendar</strong>
        <p>
          En Google Calendar (computador): Configuracion → Importar y exportar → Exportar. Se descarga un .zip con un
          archivo .ics por calendario; descomprimelo y carga aqui el del calendario de servicios. Al volver a importar,
          los eventos ya cargados se omiten automaticamente.
        </p>
      </article>

      <div className="form-grid">
        <label className="field">
          <span>Desde</span>
          <input onChange={(event) => setDesde(event.target.value)} type="date" value={desde} />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input onChange={(event) => setHasta(event.target.value)} type="date" value={hasta} />
        </label>
        <div className="field">
          <span>Archivo .ics</span>
          <button className="secondary-button" onClick={() => inputRef.current?.click()} type="button">
            {fileName || "Seleccionar archivo"}
          </button>
          <input
            accept=".ics,text/calendar"
            hidden
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setFileName(file.name);
              setFileText(await file.text());
            }}
            ref={inputRef}
            type="file"
          />
        </div>
        <label className="field">
          <span>Conductor por defecto (opcional)</span>
          <select className="select-field" onChange={(event) => setDefaultDriver(event.target.value)} value={defaultDriver}>
            <option value="">Asignar despues</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.nombre_completo}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Vehiculo por defecto (opcional)</span>
          <select className="select-field" onChange={(event) => setDefaultVehicle(event.target.value)} value={defaultVehicle}>
            <option value="">Asignar despues</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.placa}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? <p className="admin-alert admin-alert--danger">{error}</p> : null}

      {items.length ? (
        <>
          <div className="action-row">
            <strong>{items.length} evento(s) encontrados</strong>
            <span className="muted">· {selected.size} seleccionados · {existing.size} ya existian</span>
            <span className="spacer" />
            <button
              className="ghost-button small-button"
              onClick={() => setSelected(new Set(items.filter((item) => !existing.has(item.importKey)).map((item) => item.importKey)))}
              type="button"
            >
              Seleccionar nuevos
            </button>
            <button className="ghost-button small-button" onClick={() => setSelected(new Set())} type="button">
              Ninguno
            </button>
          </div>
          <div className="import-list">
            {items.map((item) => {
              const duplicate = existing.has(item.importKey);
              return (
                <label className={duplicate ? "import-row is-duplicate" : "import-row"} key={item.importKey}>
                  <input
                    checked={selected.has(item.importKey)}
                    disabled={duplicate}
                    onChange={(event) => {
                      const next = new Set(selected);
                      if (event.target.checked) next.add(item.importKey);
                      else next.delete(item.importKey);
                      setSelected(next);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <strong>{formatShortDate(item.fecha)}</strong>
                    <br />
                    <span className="muted">
                      {item.todoElDia ? "Todo el dia" : `${item.horaInicio}${item.horaFin ? ` - ${item.horaFin}` : ""}`}
                    </span>
                  </span>
                  <span>
                    <strong>{item.titulo}</strong>
                    {item.ubicacion ? <span className="muted"> · {item.ubicacion}</span> : null}
                  </span>
                  {duplicate ? <span className="status-pill status-pill--muted">Ya importado</span> : <span className="status-pill status-pill--info">Nuevo</span>}
                </label>
              );
            })}
          </div>
          <div className="action-row">
            <button className="primary-button" disabled={isImporting || selected.size === 0} onClick={() => void importSelected()} type="button">
              {isImporting ? "Importando..." : `Importar ${selected.size} servicio(s)`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
