"use client";

import { useEffect, useMemo, useState } from "react";
import {
  generateVehicleHistoryPdf,
  type VehicleHistoryProfile,
  type VehicleMaintenancePdfRecord
} from "@/lib/vehicle-history-pdf";
import { supabase } from "@/lib/supabase";
import { useCurrentAppUser } from "@/lib/current-user";

type VehicleRecord = {
  id: string;
  placa: string;
  tipo_vehiculo: string;
  capacidad: number | null;
  propietario_afiliado: string | null;
  marca: string | null;
  modelo_anio: number | null;
  numero_interno: string | null;
  numero_pasajeros: number | null;
  tipo_carroceria: string | null;
  cilindraje: string | null;
  linea: string | null;
  numero_motor: string | null;
  numero_chasis: string | null;
  identificacion_propietario: string | null;
  email_propietario: string | null;
  celular_propietario: string | null;
};

type MaintenanceRecord = {
  id: string;
  vehiculo_id: string;
  fecha: string;
  tipo: "PREVENTIVO" | "CORRECTIVO";
  asunto: string;
  descripcion: string;
  lugar: string | null;
  kilometraje_actual: number;
  proxima_fecha: string | null;
  proximo_kilometraje: number | null;
};

type MaintenanceDraft = {
  fecha: string;
  tipo: "PREVENTIVO" | "CORRECTIVO";
  asunto: string;
  descripcion: string;
  lugar: string;
  kilometrajeActual: string;
  proximaFecha: string;
  proximoKilometraje: string;
};

const defaultDraft = (): MaintenanceDraft => ({
  fecha: new Date().toISOString().slice(0, 10),
  tipo: "PREVENTIVO",
  asunto: "",
  descripcion: "",
  lugar: "",
  kilometrajeActual: "",
  proximaFecha: "",
  proximoKilometraje: ""
});

function formatDate(value: string | null) {
  if (!value) return "Sin fecha";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function asOptionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function downloadPdf(bytes: Uint8Array, fileName: string) {
  const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/pdf" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function VehicleMaintenancePanel({ role = "administrador" }: { role?: "administrador" | "conductor" }) {
  const [vehicles, setVehicles] = useState<VehicleRecord[]>([]);
  const [records, setRecords] = useState<MaintenanceRecord[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [draft, setDraft] = useState<MaintenanceDraft>(defaultDraft);
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSavingMaintenance, setIsSavingMaintenance] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [message, setMessage] = useState("");
  const { user: currentUser, loading: isLoadingUser } = useCurrentAppUser();

  useEffect(() => {
    async function loadData() {
      if (isLoadingUser) return;
      if (!supabase) {
        setMessage("Supabase no esta configurado para el modulo de mantenimientos.");
        setIsLoading(false);
        return;
      }

      let assignedVehicleIds: string[] | null = null;

      if (role === "conductor") {
        if (!currentUser?.documento) {
          setMessage("No fue posible identificar al conductor de esta sesion.");
          setIsLoading(false);
          return;
        }

        const { data: driver, error: driverError } = await supabase
          .from("conductores")
          .select("id")
          .eq("documento", currentUser.documento)
          .maybeSingle();

        if (driverError || !driver) {
          setMessage("Tu usuario no esta asociado a un conductor activo.");
          setIsLoading(false);
          return;
        }

        const { data: assignments, error: assignmentError } = await supabase
          .from("asignaciones_vehiculo_conductor")
          .select("vehiculo_id")
          .eq("conductor_id", driver.id)
          .eq("activa", true)
          .or("fecha_fin.is.null,fecha_fin.gte." + new Date().toISOString().slice(0, 10));

        if (assignmentError) {
          setMessage("No fue posible consultar el vehiculo asignado.");
          setIsLoading(false);
          return;
        }

        assignedVehicleIds = (assignments ?? []).map((assignment) => assignment.vehiculo_id);
      }

      let vehicleQuery = supabase
        .from("vehiculos")
        .select("id, placa, tipo_vehiculo, capacidad, propietario_afiliado, marca, modelo_anio, numero_interno, numero_pasajeros, tipo_carroceria, cilindraje, linea, numero_motor, numero_chasis, identificacion_propietario, email_propietario, celular_propietario")
        .order("placa");

      if (assignedVehicleIds) {
        if (assignedVehicleIds.length === 0) {
          setVehicles([]);
          setRecords([]);
          setMessage("No tienes un vehiculo activo asignado para registrar mantenimientos.");
          setIsLoading(false);
          return;
        }
        vehicleQuery = vehicleQuery.in("id", assignedVehicleIds);
      }

      const [{ data: vehicleRows, error: vehicleError }, { data: maintenanceRows, error: maintenanceError }] = await Promise.all([
        vehicleQuery,
        supabase
          .from("mantenimientos_vehiculo")
          .select("id, vehiculo_id, fecha, tipo, asunto, descripcion, lugar, kilometraje_actual, proxima_fecha, proximo_kilometraje")
          .order("fecha", { ascending: false })
          .order("created_at", { ascending: false })
      ]);

      if (vehicleError || maintenanceError) {
        setMessage(
          "No fue posible cargar mantenimientos. Confirma que ejecutaste la migracion del modulo en Supabase."
        );
        setIsLoading(false);
        return;
      }

      const nextVehicles = (vehicleRows ?? []) as VehicleRecord[];
      setVehicles(nextVehicles);
      setRecords((maintenanceRows ?? []) as MaintenanceRecord[]);
      setSelectedVehicleId(nextVehicles[0]?.id ?? "");
      setIsLoading(false);
    }

    void loadData();
  }, [currentUser?.documento, isLoadingUser, role]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles]
  );
  const vehicleRecords = useMemo(
    () => records.filter((record) => record.vehiculo_id === selectedVehicleId),
    [records, selectedVehicleId]
  );

  const updateProfile = (field: keyof VehicleRecord, value: string | number | null) => {
    if (!selectedVehicle) return;
    setVehicles((current) =>
      current.map((vehicle) =>
        vehicle.id === selectedVehicle.id ? { ...vehicle, [field]: value } : vehicle
      )
    );
  };

  const saveProfile = async () => {
    if (!supabase || !selectedVehicle) return;
    setIsSavingProfile(true);
    setMessage("");

    const { error } = await supabase
      .from("vehiculos")
      .update({
        marca: selectedVehicle.marca || null,
        modelo_anio: selectedVehicle.modelo_anio,
        numero_interno: selectedVehicle.numero_interno || null,
        numero_pasajeros: selectedVehicle.numero_pasajeros,
        tipo_carroceria: selectedVehicle.tipo_carroceria || null,
        cilindraje: selectedVehicle.cilindraje || null,
        linea: selectedVehicle.linea || null,
        numero_motor: selectedVehicle.numero_motor || null,
        numero_chasis: selectedVehicle.numero_chasis || null,
        propietario_afiliado: selectedVehicle.propietario_afiliado || null,
        identificacion_propietario: selectedVehicle.identificacion_propietario || null,
        email_propietario: selectedVehicle.email_propietario || null,
        celular_propietario: selectedVehicle.celular_propietario || null,
        updated_at: new Date().toISOString()
      })
      .eq("id", selectedVehicle.id);

    setIsSavingProfile(false);
    setMessage(error ? error.message : "Ficha tecnica del vehiculo actualizada.");
  };

  const saveMaintenance = async () => {
    if (!supabase || !selectedVehicle) return;
    const kilometrajeActual = Number(draft.kilometrajeActual);
    const proximoKilometraje = asOptionalNumber(draft.proximoKilometraje);

    if (!draft.asunto.trim() || !draft.descripcion.trim() || !Number.isFinite(kilometrajeActual)) {
      setMessage("Completa asunto, descripcion y kilometraje actual para guardar el mantenimiento.");
      return;
    }

    if (proximoKilometraje !== null && proximoKilometraje < kilometrajeActual) {
      setMessage("El proximo kilometraje no puede ser menor que el kilometraje actual.");
      return;
    }

    setIsSavingMaintenance(true);
    setMessage("");
    const { data, error } = await supabase
      .from("mantenimientos_vehiculo")
      .insert({
        vehiculo_id: selectedVehicle.id,
        fecha: draft.fecha,
        tipo: draft.tipo,
        asunto: draft.asunto.trim(),
        descripcion: draft.descripcion.trim(),
        lugar: draft.lugar.trim() || null,
        kilometraje_actual: kilometrajeActual,
        proxima_fecha: draft.proximaFecha || null,
        proximo_kilometraje: proximoKilometraje
      })
      .select("id, vehiculo_id, fecha, tipo, asunto, descripcion, lugar, kilometraje_actual, proxima_fecha, proximo_kilometraje")
      .single();

    setIsSavingMaintenance(false);
    if (error || !data) {
      setMessage(error?.message ?? "No fue posible guardar el mantenimiento.");
      return;
    }

    setRecords((current) => [data as MaintenanceRecord, ...current]);
    setDraft(defaultDraft());
    setMessage("Mantenimiento registrado correctamente.");
  };

  const exportHistoryPdf = async () => {
    if (!selectedVehicle) return;
    setIsExporting(true);
    setMessage("");

    try {
      const vehicle: VehicleHistoryProfile = {
        placa: selectedVehicle.placa,
        tipoVehiculo: selectedVehicle.tipo_vehiculo,
        capacidad: selectedVehicle.capacidad,
        propietario: selectedVehicle.propietario_afiliado,
        marca: selectedVehicle.marca,
        modeloAnio: selectedVehicle.modelo_anio,
        numeroInterno: selectedVehicle.numero_interno,
        numeroPasajeros: selectedVehicle.numero_pasajeros,
        tipoCarroceria: selectedVehicle.tipo_carroceria,
        cilindraje: selectedVehicle.cilindraje,
        linea: selectedVehicle.linea,
        numeroMotor: selectedVehicle.numero_motor,
        numeroChasis: selectedVehicle.numero_chasis,
        identificacionPropietario: selectedVehicle.identificacion_propietario,
        emailPropietario: selectedVehicle.email_propietario,
        celularPropietario: selectedVehicle.celular_propietario
      };
      const history: VehicleMaintenancePdfRecord[] = vehicleRecords.map((record) => ({
        fecha: record.fecha,
        tipo: record.tipo,
        asunto: record.asunto,
        descripcion: record.descripcion,
        lugar: record.lugar,
        kilometrajeActual: record.kilometraje_actual,
        proximaFecha: record.proxima_fecha,
        proximoKilometraje: record.proximo_kilometraje
      }));
      const pdfBytes = await generateVehicleHistoryPdf({ vehicle, records: history });
      downloadPdf(pdfBytes, `hoja-vida-${selectedVehicle.placa}.pdf`);
      setMessage("Hoja de vida en PDF generada correctamente.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No fue posible generar el PDF.");
    } finally {
      setIsExporting(false);
    }
  };

  if (isLoading) return <p className="muted">Cargando hoja de vida de vehiculos...</p>;

  return (
    <div className="stack-lg">
      <section className="content-card maintenance-header">
        <div>
          <p className="eyebrow">Flota</p>
          <h2>Hoja de vida y mantenimientos</h2>
          <p className="muted">{role === "conductor" ? "Registra mantenimientos para el vehiculo que tienes asignado." : "Registra mantenimientos preventivos o correctivos y exporta el historial de cada vehiculo."}</p>
        </div>
        <label className="field maintenance-vehicle-select">
          <span>Vehiculo</span>
          <select className="select-field" onChange={(event) => setSelectedVehicleId(event.target.value)} value={selectedVehicleId}>
            {vehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.placa} - {vehicle.tipo_vehiculo}</option>)}
          </select>
        </label>
      </section>

      {!selectedVehicle ? <p className="admin-alert admin-alert--danger">No hay vehiculos registrados para crear la hoja de vida.</p> : <>
        {role === "administrador" ? <section className="content-card stack-md">
          <div className="section-title-row">
            <div><p className="eyebrow">Ficha tecnica</p><h2>{selectedVehicle.placa}</h2></div>
            <button className="secondary-button" disabled={isSavingProfile} onClick={() => void saveProfile()} type="button">{isSavingProfile ? "Guardando..." : "Guardar ficha"}</button>
          </div>
          <div className="form-grid maintenance-profile-grid">
            <label className="field"><span>Marca</span><input onChange={(event) => updateProfile("marca", event.target.value)} value={selectedVehicle.marca ?? ""} /></label>
            <label className="field"><span>Modelo</span><input inputMode="numeric" onChange={(event) => updateProfile("modelo_anio", asOptionalNumber(event.target.value))} value={selectedVehicle.modelo_anio ?? ""} /></label>
            <label className="field"><span>No. interno</span><input onChange={(event) => updateProfile("numero_interno", event.target.value)} value={selectedVehicle.numero_interno ?? ""} /></label>
            <label className="field"><span>No. pasajeros</span><input inputMode="numeric" onChange={(event) => updateProfile("numero_pasajeros", asOptionalNumber(event.target.value))} value={selectedVehicle.numero_pasajeros ?? ""} /></label>
            <label className="field"><span>Tipo carroceria</span><input onChange={(event) => updateProfile("tipo_carroceria", event.target.value)} value={selectedVehicle.tipo_carroceria ?? ""} /></label>
            <label className="field"><span>Cilindraje</span><input onChange={(event) => updateProfile("cilindraje", event.target.value)} value={selectedVehicle.cilindraje ?? ""} /></label>
            <label className="field"><span>Linea</span><input onChange={(event) => updateProfile("linea", event.target.value)} value={selectedVehicle.linea ?? ""} /></label>
            <label className="field"><span>No. motor</span><input onChange={(event) => updateProfile("numero_motor", event.target.value)} value={selectedVehicle.numero_motor ?? ""} /></label>
            <label className="field"><span>No. chasis</span><input onChange={(event) => updateProfile("numero_chasis", event.target.value)} value={selectedVehicle.numero_chasis ?? ""} /></label>
            <label className="field"><span>Propietario</span><input onChange={(event) => updateProfile("propietario_afiliado", event.target.value)} value={selectedVehicle.propietario_afiliado ?? ""} /></label>
            <label className="field"><span>Identificacion propietario</span><input onChange={(event) => updateProfile("identificacion_propietario", event.target.value)} value={selectedVehicle.identificacion_propietario ?? ""} /></label>
            <label className="field"><span>Correo propietario</span><input onChange={(event) => updateProfile("email_propietario", event.target.value)} value={selectedVehicle.email_propietario ?? ""} /></label>
            <label className="field"><span>Celular propietario</span><input onChange={(event) => updateProfile("celular_propietario", event.target.value)} value={selectedVehicle.celular_propietario ?? ""} /></label>
          </div>
        </section> : null}

        <section className="content-card stack-md">
          <div className="section-title-row"><div><p className="eyebrow">Nuevo registro</p><h2>Registrar mantenimiento</h2></div></div>
          <div className="form-grid maintenance-form-grid">
            <label className="field"><span>Fecha</span><input onChange={(event) => setDraft((current) => ({ ...current, fecha: event.target.value }))} type="date" value={draft.fecha} /></label>
            <label className="field"><span>Tipo</span><select className="select-field" onChange={(event) => setDraft((current) => ({ ...current, tipo: event.target.value as MaintenanceDraft["tipo"] }))} value={draft.tipo}><option value="PREVENTIVO">Preventivo</option><option value="CORRECTIVO">Correctivo</option></select></label>
            <label className="field"><span>Asunto</span><input onChange={(event) => setDraft((current) => ({ ...current, asunto: event.target.value }))} placeholder="Ej: Cambio de aceite" value={draft.asunto} /></label>
            <label className="field"><span>Lugar o taller</span><input onChange={(event) => setDraft((current) => ({ ...current, lugar: event.target.value }))} placeholder="Ej: Taller central" value={draft.lugar} /></label>
            <label className="field"><span>Kilometraje actual</span><input inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, kilometrajeActual: event.target.value }))} value={draft.kilometrajeActual} /></label>
            <label className="field"><span>Proxima fecha</span><input onChange={(event) => setDraft((current) => ({ ...current, proximaFecha: event.target.value }))} type="date" value={draft.proximaFecha} /></label>
            <label className="field"><span>Proximo kilometraje</span><input inputMode="numeric" onChange={(event) => setDraft((current) => ({ ...current, proximoKilometraje: event.target.value }))} value={draft.proximoKilometraje} /></label>
            <label className="field maintenance-description"><span>Descripcion del trabajo realizado</span><textarea className="text-area" onChange={(event) => setDraft((current) => ({ ...current, descripcion: event.target.value }))} rows={3} value={draft.descripcion} /></label>
          </div>
          <div className="action-row"><button className="primary-button" disabled={isSavingMaintenance} onClick={() => void saveMaintenance()} type="button">{isSavingMaintenance ? "Guardando..." : "Registrar mantenimiento"}</button></div>
        </section>

        <section className="content-card stack-md">
          <div className="section-title-row"><div><p className="eyebrow">Historial</p><h2>{vehicleRecords.length} mantenimiento(s) registrados</h2></div>{role === "administrador" ? <button className="primary-button" disabled={isExporting} onClick={() => void exportHistoryPdf()} type="button">{isExporting ? "Generando PDF..." : "Exportar hoja de vida PDF"}</button> : null}</div>
          <div className="maintenance-history">
            {vehicleRecords.length === 0 ? <p className="muted">Aun no hay mantenimientos para este vehiculo.</p> : vehicleRecords.map((record) => <article className="maintenance-record" key={record.id}><div><strong>{formatDate(record.fecha)} | {record.tipo === "PREVENTIVO" ? "Preventivo" : "Correctivo"}</strong><p>{record.asunto}</p><p className="muted">{record.descripcion}</p></div><div className="maintenance-record__meta"><span>{record.lugar || "Sin lugar"}</span><span>KM {record.kilometraje_actual}</span>{record.proxima_fecha ? <span>Proxima: {formatDate(record.proxima_fecha)}</span> : null}{record.proximo_kilometraje ? <span>KM proximo: {record.proximo_kilometraje}</span> : null}</div></article>)}
          </div>
        </section>
      </>}
      {message ? <p className={message.includes("correctamente") || message.includes("actualizada") ? "admin-alert" : "admin-alert admin-alert--danger"}>{message}</p> : null}
    </div>
  );
}
