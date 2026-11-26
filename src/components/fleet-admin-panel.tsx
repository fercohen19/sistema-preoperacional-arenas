"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { authedFetch } from "@/lib/api-client";
import { friendlyDbError, todayBogota } from "@/lib/services";
import { supabase } from "@/lib/supabase";

type Tab = "conductores" | "vehiculos";

type Driver = {
  id: string;
  documento: string;
  nombre_completo: string;
  celular: string | null;
  numero_licencia: string | null;
  vigencia_licencia: string | null;
  estado: string;
};

type Vehicle = {
  id: string;
  placa: string;
  tipo_vehiculo: string;
  capacidad: number | null;
  estado: string;
  marca: string | null;
  modelo_anio: number | null;
  linea: string | null;
  numero_interno: string | null;
  tipo_carroceria: string | null;
  cilindraje: string | null;
  numero_motor: string | null;
  numero_chasis: string | null;
  propietario_afiliado: string | null;
  identificacion_propietario: string | null;
  celular_propietario: string | null;
  email_propietario: string | null;
};

type Assignment = { id: string; vehiculo_id: string; conductor_id: string; fecha_inicio: string; fecha_fin: string | null };
type AppUser = { documento: string; rol: string; activo: boolean; auth_user_id: string | null; email: string | null };

const VEHICLE_COLUMNS =
  "id, placa, tipo_vehiculo, capacidad, estado, marca, modelo_anio, linea, numero_interno, tipo_carroceria, cilindraje, numero_motor, numero_chasis, propietario_afiliado, identificacion_propietario, celular_propietario, email_propietario";

const emptyDriver = { id: "", documento: "", nombre_completo: "", celular: "", numero_licencia: "", vigencia_licencia: "", estado: "ACTIVO" };
const emptyVehicle = {
  id: "",
  placa: "",
  tipo_vehiculo: "VAN",
  capacidad: "",
  estado: "ACTIVO",
  marca: "",
  modelo_anio: "",
  linea: "",
  numero_interno: "",
  tipo_carroceria: "",
  cilindraje: "",
  numero_motor: "",
  numero_chasis: "",
  propietario_afiliado: "",
  identificacion_propietario: "",
  celular_propietario: "",
  email_propietario: ""
};

type DriverDraft = typeof emptyDriver & { crearAcceso: boolean; email: string; password: string };
type VehicleDraft = typeof emptyVehicle;

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function daysUntil(date: string | null) {
  if (!date) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [ty, tm, td] = todayBogota().split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function randomPassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = new Uint32Array(10);
  crypto.getRandomValues(values);
  return `Arenas-${Array.from(values, (value) => chars[value % chars.length]).join("")}`;
}

export function FleetAdminPanel() {
  const [tab, setTab] = useState<Tab>("conductores");
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState("");
  const [driverDraft, setDriverDraft] = useState<DriverDraft | null>(null);
  const [vehicleDraft, setVehicleDraft] = useState<VehicleDraft | null>(null);
  const [accessFor, setAccessFor] = useState<{ driver: Driver; mode: "crear" | "cambiar_clave"; email: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) {
      setMessage({ tone: "danger", text: "Supabase no esta configurado." });
      return;
    }
    const [d, v, a, u] = await Promise.all([
      supabase.from("conductores").select("id, documento, nombre_completo, celular, numero_licencia, vigencia_licencia, estado").order("nombre_completo"),
      supabase.from("vehiculos").select(VEHICLE_COLUMNS).order("placa"),
      supabase.from("asignaciones_vehiculo_conductor").select("id, vehiculo_id, conductor_id, fecha_inicio, fecha_fin").eq("activa", true),
      supabase.from("usuarios").select("documento, rol, activo, auth_user_id, email")
    ]);
    if (d.error || v.error) setMessage({ tone: "danger", text: friendlyDbError(d.error?.message ?? v.error?.message) });
    setDrivers((d.data ?? []) as Driver[]);
    setVehicles((v.data ?? []) as Vehicle[]);
    const today = todayBogota();
    setAssignments(((a.data ?? []) as Assignment[]).filter((row) => !row.fecha_fin || row.fecha_fin >= today));
    setUsers((u.data ?? []) as AppUser[]);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const plate = (id: string) => vehicles.find((vehicle) => vehicle.id === id)?.placa ?? "?";
  const driverName = (id: string) => drivers.find((driver) => driver.id === id)?.nombre_completo ?? "?";
  const userFor = (documento: string) => users.find((user) => user.documento === documento);

  const term = search.trim().toLowerCase();
  const visibleDrivers = useMemo(
    () =>
      drivers.filter(
        (driver) =>
          (showInactive || driver.estado === "ACTIVO") &&
          (!term || `${driver.nombre_completo} ${driver.documento}`.toLowerCase().includes(term))
      ),
    [drivers, showInactive, term]
  );
  const visibleVehicles = useMemo(
    () =>
      vehicles.filter(
        (vehicle) =>
          (showInactive || vehicle.estado === "ACTIVO") &&
          (!term || `${vehicle.placa} ${vehicle.marca ?? ""} ${vehicle.tipo_vehiculo}`.toLowerCase().includes(term))
      ),
    [showInactive, term, vehicles]
  );

  const assign = async (conductorId: string, vehiculoId: string) => {
    if (!supabase || !vehiculoId) return;
    if (assignments.some((row) => row.conductor_id === conductorId && row.vehiculo_id === vehiculoId)) return;
    const { error } = await supabase
      .from("asignaciones_vehiculo_conductor")
      .insert({ conductor_id: conductorId, vehiculo_id: vehiculoId, fecha_inicio: todayBogota(), activa: true });
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message) });
    else {
      setMessage({ tone: "ok", text: `${plate(vehiculoId)} asignado a ${driverName(conductorId)}. Ya puede ver y registrar sus mantenimientos.` });
      await load();
    }
  };

  const unassign = async (assignment: Assignment) => {
    if (!supabase) return;
    const { error } = await supabase
      .from("asignaciones_vehiculo_conductor")
      .update({ activa: false, fecha_fin: todayBogota() })
      .eq("id", assignment.id);
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message) });
    else {
      setMessage({ tone: "ok", text: `${plate(assignment.vehiculo_id)} ya no esta asignado a ${driverName(assignment.conductor_id)}.` });
      await load();
    }
  };

  const saveDriver = async () => {
    if (!supabase || !driverDraft) return;
    const documento = driverDraft.documento.replace(/\D/g, "");
    if (!documento || !driverDraft.nombre_completo.trim()) {
      setMessage({ tone: "danger", text: "Documento y nombre son obligatorios." });
      return;
    }
    setBusy(true);
    const row = {
      documento,
      nombre_completo: driverDraft.nombre_completo.trim().toUpperCase(),
      celular: driverDraft.celular.trim() || null,
      numero_licencia: driverDraft.numero_licencia.trim() || null,
      vigencia_licencia: driverDraft.vigencia_licencia || null,
      estado: driverDraft.estado,
      updated_at: new Date().toISOString()
    };
    const { error } = driverDraft.id
      ? await supabase.from("conductores").update(row).eq("id", driverDraft.id)
      : await supabase.from("conductores").insert(row);
    if (error) {
      setBusy(false);
      setMessage({
        tone: "danger",
        text: /duplicate|unique/i.test(error.message) ? "Ya existe un conductor con ese documento." : friendlyDbError(error.message)
      });
      return;
    }
    let text = driverDraft.id ? "Conductor actualizado." : "Conductor agregado.";
    if (!driverDraft.id && driverDraft.crearAcceso) {
      const access = await authedFetch("/api/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({
          accion: "crear",
          documento,
          nombre_completo: row.nombre_completo,
          email: driverDraft.email,
          password: driverDraft.password,
          celular: row.celular,
          rol: "conductor"
        })
      });
      text += access.ok
        ? ` Acceso creado: ${driverDraft.email} / ${driverDraft.password} (compartelo de forma privada).`
        : ` No se creo el acceso: ${access.data.mensaje ?? "error"}`;
    }
    setBusy(false);
    setDriverDraft(null);
    setMessage({ tone: text.includes("No se creo") ? "warn" : "ok", text });
    await load();
  };

  const saveVehicle = async () => {
    if (!supabase || !vehicleDraft) return;
    const placa = vehicleDraft.placa.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (placa.length < 5 || !vehicleDraft.tipo_vehiculo.trim()) {
      setMessage({ tone: "danger", text: "Placa y tipo de vehiculo son obligatorios." });
      return;
    }
    setBusy(true);
    const toInt = (value: string) => (value.trim() ? Number(value.replace(/\D/g, "")) : null);
    const text = (value: string) => value.trim() || null;
    const row = {
      placa,
      tipo_vehiculo: vehicleDraft.tipo_vehiculo.trim().toUpperCase(),
      capacidad: toInt(vehicleDraft.capacidad),
      numero_pasajeros: toInt(vehicleDraft.capacidad),
      estado: vehicleDraft.estado,
      marca: text(vehicleDraft.marca),
      modelo_anio: toInt(vehicleDraft.modelo_anio),
      linea: text(vehicleDraft.linea),
      numero_interno: text(vehicleDraft.numero_interno),
      tipo_carroceria: text(vehicleDraft.tipo_carroceria),
      cilindraje: text(vehicleDraft.cilindraje),
      numero_motor: text(vehicleDraft.numero_motor),
      numero_chasis: text(vehicleDraft.numero_chasis),
      propietario_afiliado: text(vehicleDraft.propietario_afiliado),
      identificacion_propietario: text(vehicleDraft.identificacion_propietario),
      celular_propietario: text(vehicleDraft.celular_propietario),
      email_propietario: text(vehicleDraft.email_propietario),
      updated_at: new Date().toISOString()
    };
    const { error } = vehicleDraft.id
      ? await supabase.from("vehiculos").update(row).eq("id", vehicleDraft.id)
      : await supabase.from("vehiculos").insert(row);
    setBusy(false);
    if (error) {
      setMessage({
        tone: "danger",
        text: /duplicate|unique/i.test(error.message) ? "Ya existe un vehiculo con esa placa." : friendlyDbError(error.message)
      });
      return;
    }
    setVehicleDraft(null);
    setMessage({ tone: "ok", text: vehicleDraft.id ? "Vehiculo actualizado." : "Vehiculo agregado." });
    await load();
  };

  const toggleDriver = async (driver: Driver) => {
    if (!supabase) return;
    const activate = driver.estado !== "ACTIVO";
    if (!activate && !window.confirm(`Desactivar a ${driver.nombre_completo}? No aparecera en la agenda, el preoperacional ni el FUEC, y se bloqueara su acceso. Su historial se conserva.`)) return;
    const { error } = await supabase
      .from("conductores")
      .update({ estado: activate ? "ACTIVO" : "INACTIVO", updated_at: new Date().toISOString() })
      .eq("id", driver.id);
    if (error) {
      setMessage({ tone: "danger", text: friendlyDbError(error.message) });
      return;
    }
    if (!activate) {
      const today = todayBogota();
      await supabase
        .from("asignaciones_vehiculo_conductor")
        .update({ activa: false, fecha_fin: today })
        .eq("conductor_id", driver.id)
        .eq("activa", true);
    }
    let note = "";
    if (userFor(driver.documento)?.auth_user_id) {
      const access = await authedFetch("/api/admin/usuarios", {
        method: "POST",
        body: JSON.stringify({ accion: activate ? "activar" : "desactivar", documento: driver.documento })
      });
      note = access.ok ? ` ${access.data.mensaje}` : ` (Acceso: ${access.data.mensaje})`;
    }
    setMessage({ tone: "ok", text: `${driver.nombre_completo} ${activate ? "reactivado" : "desactivado"}.${note}` });
    await load();
  };

  const toggleVehicle = async (vehicle: Vehicle) => {
    if (!supabase) return;
    const activate = vehicle.estado !== "ACTIVO";
    if (!activate && !window.confirm(`Desactivar ${vehicle.placa}? No se podra usar en preoperacional, FUEC ni agenda. Su historial se conserva.`)) return;
    const { error } = await supabase
      .from("vehiculos")
      .update({ estado: activate ? "ACTIVO" : "INACTIVO", updated_at: new Date().toISOString() })
      .eq("id", vehicle.id);
    if (error) setMessage({ tone: "danger", text: friendlyDbError(error.message) });
    else {
      if (!activate) {
        await supabase.from("asignaciones_vehiculo_conductor").update({ activa: false, fecha_fin: todayBogota() }).eq("vehiculo_id", vehicle.id).eq("activa", true);
      }
      setMessage({ tone: "ok", text: `${vehicle.placa} ${activate ? "reactivado" : "desactivado"}.` });
      await load();
    }
  };

  const removeRecord = async (table: "conductores" | "vehiculos", id: string, label: string) => {
    if (!supabase) return;
    if (!window.confirm(`Eliminar definitivamente ${label}? Solo es posible si no tiene inspecciones, FUEC, servicios ni mantenimientos.`)) return;
    await supabase.from("asignaciones_vehiculo_conductor").delete().eq(table === "conductores" ? "conductor_id" : "vehiculo_id", id);
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) {
      setMessage({
        tone: "warn",
        text: /foreign key|violates/i.test(error.message)
          ? `${label} tiene historial (inspecciones, FUEC o servicios) y no se puede borrar. Usa “Desactivar”: deja de aparecer y se conserva el historial.`
          : friendlyDbError(error.message)
      });
      await load();
      return;
    }
    setMessage({ tone: "ok", text: `${label} eliminado.` });
    await load();
  };

  const submitAccess = async () => {
    if (!accessFor) return;
    setBusy(true);
    const result = await authedFetch("/api/admin/usuarios", {
      method: "POST",
      body: JSON.stringify({
        accion: accessFor.mode,
        documento: accessFor.driver.documento,
        nombre_completo: accessFor.driver.nombre_completo,
        email: accessFor.email,
        password: accessFor.password,
        celular: accessFor.driver.celular,
        rol: "conductor"
      })
    });
    setBusy(false);
    if (!result.ok) {
      setMessage({ tone: "danger", text: result.data.mensaje ?? "No fue posible guardar el acceso." });
      return;
    }
    setMessage({
      tone: "ok",
      text: `${result.data.mensaje} Usuario: ${accessFor.email || userFor(accessFor.driver.documento)?.email || ""} · Contrasena: ${accessFor.password} (compartela de forma privada).`
    });
    setAccessFor(null);
    await load();
  };

  const activeDrivers = drivers.filter((driver) => driver.estado === "ACTIVO");
  const activeVehicles = vehicles.filter((vehicle) => vehicle.estado === "ACTIVO");
  const expiring = activeDrivers.filter((driver) => {
    const days = daysUntil(driver.vigencia_licencia);
    return days !== null && days <= 30;
  });

  return (
    <div className="stack-lg">
      <div className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Conductores</p>
          <p className="stat-value">{activeDrivers.length}</p>
          <p className="muted">Activos</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Vehiculos</p>
          <p className="stat-value">{activeVehicles.length}</p>
          <p className="muted">Activos · {activeVehicles.reduce((sum, vehicle) => sum + (vehicle.capacidad ?? 0), 0)} puestos</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Sin vehiculo</p>
          <p className="stat-value">{activeDrivers.filter((driver) => !assignments.some((row) => row.conductor_id === driver.id)).length}</p>
          <p className="muted">Conductores sin asignacion</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Licencias</p>
          <p className="stat-value" style={{ color: expiring.length ? "var(--coral-strong)" : undefined }}>
            {expiring.length}
          </p>
          <p className="muted">Vencidas o por vencer (30 dias)</p>
        </article>
      </div>

      {message ? (
        <p className={`admin-alert ${message.tone === "danger" ? "admin-alert--danger" : message.tone === "warn" ? "admin-alert--warn" : ""}`}>
          {message.text}
        </p>
      ) : null}

      <div className="tabs" role="tablist">
        <button className={tab === "conductores" ? "tab is-active" : "tab"} onClick={() => setTab("conductores")} type="button">
          Conductores
        </button>
        <button className={tab === "vehiculos" ? "tab is-active" : "tab"} onClick={() => setTab("vehiculos")} type="button">
          Vehiculos
        </button>
      </div>

      <div className="toolbar">
        <input className="input" onChange={(event) => setSearch(event.target.value)} placeholder={tab === "conductores" ? "Buscar por nombre o documento" : "Buscar por placa o marca"} style={{ maxWidth: 320 }} value={search} />
        <label className="check-option">
          <input checked={showInactive} onChange={(event) => setShowInactive(event.target.checked)} type="checkbox" />
          Mostrar inactivos
        </label>
        <span className="spacer" />
        {tab === "conductores" ? (
          <button className="primary-button small-button" onClick={() => setDriverDraft({ ...emptyDriver, crearAcceso: true, email: "", password: randomPassword() })} type="button">
            + Agregar conductor
          </button>
        ) : (
          <button className="primary-button small-button" onClick={() => setVehicleDraft({ ...emptyVehicle })} type="button">
            + Agregar vehiculo
          </button>
        )}
      </div>

      {tab === "conductores" ? (
        <div className="cards-grid">
          {visibleDrivers.map((driver) => {
            const user = userFor(driver.documento);
            const mine = assignments.filter((row) => row.conductor_id === driver.id);
            const licenseDays = daysUntil(driver.vigencia_licencia);
            const free = activeVehicles.filter((vehicle) => !mine.some((row) => row.vehiculo_id === vehicle.id));
            return (
              <article className={driver.estado === "ACTIVO" ? "person-card" : "person-card is-inactive"} key={driver.id}>
                <div className="person-card__head">
                  <div className="action-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <span className="avatar">{initials(driver.nombre_completo)}</span>
                    <div>
                      <strong>{driver.nombre_completo}</strong>
                      <p className="muted">
                        CC {driver.documento}
                        {driver.celular ? ` · ${driver.celular}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`status-pill ${driver.estado === "ACTIVO" ? "status-pill--ok" : "status-pill--muted"}`}>
                    {driver.estado === "ACTIVO" ? "Activo" : "Inactivo"}
                  </span>
                </div>

                <div className="action-row">
                  <span
                    className={`status-pill ${
                      licenseDays === null ? "status-pill--muted" : licenseDays < 0 ? "status-pill--danger" : licenseDays <= 30 ? "status-pill--warn" : "status-pill--ok"
                    }`}
                  >
                    {licenseDays === null
                      ? "Licencia sin fecha"
                      : licenseDays < 0
                        ? `Licencia vencida (${driver.vigencia_licencia})`
                        : `Licencia vence ${driver.vigencia_licencia}`}
                  </span>
                  <span className={`status-pill ${user?.auth_user_id ? (user.activo ? "status-pill--info" : "status-pill--danger") : "status-pill--muted"}`}>
                    {user?.auth_user_id ? (user.activo ? "Con acceso" : "Acceso bloqueado") : "Sin acceso"}
                  </span>
                </div>

                <div className="stack-sm">
                  <span className="field-hint">Vehiculos asignados (puede ver y registrar sus mantenimientos)</span>
                  <div className="action-row">
                    {mine.length === 0 ? <span className="muted">Ninguno</span> : null}
                    {mine.map((row) => (
                      <span className="chip" key={row.id}>
                        🚐 {plate(row.vehiculo_id)}
                        <button className="chip-remove" onClick={() => void unassign(row)} title="Quitar asignacion" type="button">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {driver.estado === "ACTIVO" && free.length ? (
                    <select className="select-field" onChange={(event) => void assign(driver.id, event.target.value)} value="">
                      <option value="">+ Asignar vehiculo...</option>
                      {free.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.placa} · {vehicle.tipo_vehiculo}
                          {assignments.some((row) => row.vehiculo_id === vehicle.id) ? " (compartido)" : ""}
                        </option>
                      ))}
                    </select>
                  ) : null}
                </div>

                <div className="action-row">
                  <button
                    className="ghost-button small-button"
                    onClick={() =>
                      setDriverDraft({
                        id: driver.id,
                        documento: driver.documento,
                        nombre_completo: driver.nombre_completo,
                        celular: driver.celular ?? "",
                        numero_licencia: driver.numero_licencia ?? "",
                        vigencia_licencia: driver.vigencia_licencia ?? "",
                        estado: driver.estado,
                        crearAcceso: false,
                        email: "",
                        password: ""
                      })
                    }
                    type="button"
                  >
                    Editar
                  </button>
                  {driver.estado === "ACTIVO" ? (
                    user?.auth_user_id ? (
                      <button className="ghost-button small-button" onClick={() => setAccessFor({ driver, mode: "cambiar_clave", email: user.email ?? "", password: randomPassword() })} type="button">
                        Cambiar contrasena
                      </button>
                    ) : (
                      <button className="secondary-button small-button" onClick={() => setAccessFor({ driver, mode: "crear", email: "", password: randomPassword() })} type="button">
                        Crear acceso
                      </button>
                    )
                  ) : null}
                  <span className="spacer" />
                  <button className={driver.estado === "ACTIVO" ? "danger-button small-button" : "secondary-button small-button"} onClick={() => void toggleDriver(driver)} type="button">
                    {driver.estado === "ACTIVO" ? "Desactivar" : "Reactivar"}
                  </button>
                  {driver.estado !== "ACTIVO" ? (
                    <button className="icon-button" onClick={() => void removeRecord("conductores", driver.id, driver.nombre_completo)} title="Eliminar definitivamente" type="button">
                      🗑
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {visibleDrivers.length === 0 ? <div className="empty-state">No hay conductores para mostrar.</div> : null}
        </div>
      ) : (
        <div className="cards-grid">
          {visibleVehicles.map((vehicle) => {
            const holders = assignments.filter((row) => row.vehiculo_id === vehicle.id);
            return (
              <article className={vehicle.estado === "ACTIVO" ? "person-card" : "person-card is-inactive"} key={vehicle.id}>
                <div className="person-card__head">
                  <div className="action-row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
                    <span className="avatar avatar--vehicle">🚐</span>
                    <div>
                      <strong style={{ fontSize: "1.1rem", letterSpacing: "0.05em" }}>{vehicle.placa}</strong>
                      <p className="muted">
                        {vehicle.tipo_vehiculo}
                        {vehicle.marca ? ` · ${vehicle.marca}` : ""}
                        {vehicle.linea ? ` ${vehicle.linea}` : ""}
                        {vehicle.modelo_anio ? ` · ${vehicle.modelo_anio}` : ""}
                      </p>
                    </div>
                  </div>
                  <span className={`status-pill ${vehicle.estado === "ACTIVO" ? "status-pill--ok" : "status-pill--muted"}`}>
                    {vehicle.estado === "ACTIVO" ? "Activo" : "Inactivo"}
                  </span>
                </div>
                <div className="action-row">
                  <span className="chip">👥 {vehicle.capacidad ?? "?"} puestos</span>
                  {vehicle.numero_interno ? <span className="chip">Interno {vehicle.numero_interno}</span> : null}
                  {vehicle.propietario_afiliado ? <span className="chip">Propietario: {vehicle.propietario_afiliado}</span> : null}
                </div>
                <div className="stack-sm">
                  <span className="field-hint">Conductores asignados</span>
                  <div className="action-row">
                    {holders.length === 0 ? <span className="muted">Ninguno</span> : null}
                    {holders.map((row) => (
                      <span className="chip" key={row.id}>
                        {driverName(row.conductor_id)}
                        <button className="chip-remove" onClick={() => void unassign(row)} title="Quitar asignacion" type="button">
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  {vehicle.estado === "ACTIVO" ? (
                    <select className="select-field" onChange={(event) => void assign(event.target.value, vehicle.id)} value="">
                      <option value="">+ Asignar conductor...</option>
                      {activeDrivers
                        .filter((driver) => !holders.some((row) => row.conductor_id === driver.id))
                        .map((driver) => (
                          <option key={driver.id} value={driver.id}>
                            {driver.nombre_completo}
                          </option>
                        ))}
                    </select>
                  ) : null}
                </div>
                <div className="action-row">
                  <button
                    className="ghost-button small-button"
                    onClick={() =>
                      setVehicleDraft({
                        id: vehicle.id,
                        placa: vehicle.placa,
                        tipo_vehiculo: vehicle.tipo_vehiculo,
                        capacidad: vehicle.capacidad?.toString() ?? "",
                        estado: vehicle.estado,
                        marca: vehicle.marca ?? "",
                        modelo_anio: vehicle.modelo_anio?.toString() ?? "",
                        linea: vehicle.linea ?? "",
                        numero_interno: vehicle.numero_interno ?? "",
                        tipo_carroceria: vehicle.tipo_carroceria ?? "",
                        cilindraje: vehicle.cilindraje ?? "",
                        numero_motor: vehicle.numero_motor ?? "",
                        numero_chasis: vehicle.numero_chasis ?? "",
                        propietario_afiliado: vehicle.propietario_afiliado ?? "",
                        identificacion_propietario: vehicle.identificacion_propietario ?? "",
                        celular_propietario: vehicle.celular_propietario ?? "",
                        email_propietario: vehicle.email_propietario ?? ""
                      })
                    }
                    type="button"
                  >
                    Editar
                  </button>
                  <Link className="ghost-button small-button" href="/admin/mantenimientos">
                    Mantenimientos
                  </Link>
                  <span className="spacer" />
                  <button className={vehicle.estado === "ACTIVO" ? "danger-button small-button" : "secondary-button small-button"} onClick={() => void toggleVehicle(vehicle)} type="button">
                    {vehicle.estado === "ACTIVO" ? "Desactivar" : "Reactivar"}
                  </button>
                  {vehicle.estado !== "ACTIVO" ? (
                    <button className="icon-button" onClick={() => void removeRecord("vehiculos", vehicle.id, vehicle.placa)} title="Eliminar definitivamente" type="button">
                      🗑
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
          {visibleVehicles.length === 0 ? <div className="empty-state">No hay vehiculos para mostrar.</div> : null}
        </div>
      )}

      {driverDraft ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setDriverDraft(null)}>
          <aside className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{driverDraft.id ? "Editar conductor" : "Nuevo conductor"}</p>
                <h2>{driverDraft.nombre_completo || "Conductor"}</h2>
              </div>
              <button className="icon-button" onClick={() => setDriverDraft(null)} type="button">
                ✕
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>Documento</span>
                <input disabled={Boolean(driverDraft.id)} inputMode="numeric" onChange={(event) => setDriverDraft({ ...driverDraft, documento: event.target.value })} value={driverDraft.documento} />
              </label>
              <label className="field span-2">
                <span>Nombre completo</span>
                <input onChange={(event) => setDriverDraft({ ...driverDraft, nombre_completo: event.target.value })} value={driverDraft.nombre_completo} />
              </label>
              <label className="field">
                <span>Celular</span>
                <input inputMode="tel" onChange={(event) => setDriverDraft({ ...driverDraft, celular: event.target.value })} value={driverDraft.celular} />
              </label>
              <label className="field">
                <span>Numero de licencia</span>
                <input onChange={(event) => setDriverDraft({ ...driverDraft, numero_licencia: event.target.value })} value={driverDraft.numero_licencia} />
              </label>
              <label className="field">
                <span>Vigencia de licencia</span>
                <input onChange={(event) => setDriverDraft({ ...driverDraft, vigencia_licencia: event.target.value })} type="date" value={driverDraft.vigencia_licencia} />
              </label>
            </div>
            {driverDraft.id ? (
              <p className="field-hint">El documento no se cambia porque conecta al conductor con su usuario y su historial.</p>
            ) : (
              <div className="finance-box">
                <label className="check-option" style={{ justifySelf: "start" }}>
                  <input checked={driverDraft.crearAcceso} onChange={(event) => setDriverDraft({ ...driverDraft, crearAcceso: event.target.checked })} type="checkbox" />
                  Crear usuario para que entre al sistema
                </label>
                {driverDraft.crearAcceso ? (
                  <div className="form-grid">
                    <label className="field span-2">
                      <span>Correo (usuario)</span>
                      <input inputMode="email" onChange={(event) => setDriverDraft({ ...driverDraft, email: event.target.value })} value={driverDraft.email} />
                    </label>
                    <label className="field">
                      <span>Contrasena inicial</span>
                      <input onChange={(event) => setDriverDraft({ ...driverDraft, password: event.target.value })} value={driverDraft.password} />
                    </label>
                  </div>
                ) : null}
              </div>
            )}
            <div className="action-row">
              <button className="primary-button" disabled={busy} onClick={() => void saveDriver()} type="button">
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button className="ghost-button" onClick={() => setDriverDraft(null)} type="button">
                Cancelar
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {vehicleDraft ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setVehicleDraft(null)}>
          <aside className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{vehicleDraft.id ? "Editar vehiculo" : "Nuevo vehiculo"}</p>
                <h2>{vehicleDraft.placa || "Vehiculo"}</h2>
              </div>
              <button className="icon-button" onClick={() => setVehicleDraft(null)} type="button">
                ✕
              </button>
            </div>
            <div className="form-grid">
              {(
                [
                  ["placa", "Placa"],
                  ["tipo_vehiculo", "Tipo (VAN, BUS, CAMIONETA...)"],
                  ["capacidad", "Capacidad de pasajeros"],
                  ["marca", "Marca"],
                  ["linea", "Linea"],
                  ["modelo_anio", "Modelo (ano)"],
                  ["numero_interno", "Numero interno"],
                  ["tipo_carroceria", "Carroceria"],
                  ["cilindraje", "Cilindraje"],
                  ["numero_motor", "Numero de motor"],
                  ["numero_chasis", "Numero de chasis"],
                  ["propietario_afiliado", "Propietario"],
                  ["identificacion_propietario", "Identificacion propietario"],
                  ["celular_propietario", "Celular propietario"],
                  ["email_propietario", "Correo propietario"]
                ] as Array<[keyof VehicleDraft, string]>
              ).map(([key, label]) => (
                <label className="field" key={key}>
                  <span>{label}</span>
                  <input
                    onChange={(event) => setVehicleDraft({ ...vehicleDraft, [key]: event.target.value })}
                    value={vehicleDraft[key]}
                  />
                </label>
              ))}
            </div>
            <div className="action-row">
              <button className="primary-button" disabled={busy} onClick={() => void saveVehicle()} type="button">
                {busy ? "Guardando..." : "Guardar"}
              </button>
              <button className="ghost-button" onClick={() => setVehicleDraft(null)} type="button">
                Cancelar
              </button>
            </div>
          </aside>
        </div>
      ) : null}

      {accessFor ? (
        <div className="drawer-backdrop" onClick={(event) => event.target === event.currentTarget && setAccessFor(null)}>
          <aside className="drawer">
            <div className="drawer__head">
              <div>
                <p className="eyebrow">{accessFor.mode === "crear" ? "Crear acceso" : "Cambiar contrasena"}</p>
                <h2>{accessFor.driver.nombre_completo}</h2>
              </div>
              <button className="icon-button" onClick={() => setAccessFor(null)} type="button">
                ✕
              </button>
            </div>
            <div className="form-grid">
              {accessFor.mode === "crear" ? (
                <label className="field span-2">
                  <span>Correo (usuario para entrar)</span>
                  <input inputMode="email" onChange={(event) => setAccessFor({ ...accessFor, email: event.target.value })} value={accessFor.email} />
                </label>
              ) : (
                <div className="field span-2">
                  <span>Usuario</span>
                  <strong style={{ paddingTop: 10 }}>{accessFor.email || "-"}</strong>
                </div>
              )}
              <label className="field">
                <span>Contrasena</span>
                <input onChange={(event) => setAccessFor({ ...accessFor, password: event.target.value })} value={accessFor.password} />
              </label>
            </div>
            <p className="field-hint">Minimo 8 caracteres. Entregala al conductor por un canal privado.</p>
            <div className="action-row">
              <button className="primary-button" disabled={busy} onClick={() => void submitAccess()} type="button">
                {busy ? "Guardando..." : accessFor.mode === "crear" ? "Crear acceso" : "Cambiar contrasena"}
              </button>
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
