"use client";

import { useEffect, useMemo, useState } from "react";
import { getBogotaDate } from "@/lib/date-utils";
import { supabase } from "@/lib/supabase";

type InspectionPendingRecord = {
  id: string;
  codigo: string;
  fecha_operacion: string;
  fecha_hora_cierre: string | null;
  resultado: string | null;
  kilometraje: number;
  vehiculos: { placa: string; tipo_vehiculo: string } | null;
  conductores: { nombre_completo: string; documento: string } | null;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin fecha de cierre";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Bogota"
  }).format(date);
}

export function PendingFuecQueue() {
  const [records, setRecords] = useState<InspectionPendingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function loadQueue() {
      if (!supabase) {
        setMessage("Supabase no esta configurado para consultar la cola de FUEC.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setMessage("");

      const today = getBogotaDate();
      const [{ data: inspections, error: inspectionsError }, { data: fuecs, error: fuecsError }] =
        await Promise.all([
          supabase
            .from("inspecciones_preoperacionales")
            .select(
              "id, codigo, fecha_operacion, fecha_hora_cierre, resultado, kilometraje, vehiculos(placa, tipo_vehiculo), conductores(nombre_completo, documento)"
            )
            .eq("fecha_operacion", today)
            .eq("cerrada", true)
            .in("resultado", ["APTO", "APTO_CON_OBSERVACION"])
            .order("fecha_hora_cierre", { ascending: false })
            .limit(50),
          supabase.from("fuecs").select("inspeccion_id").eq("fecha_emision", today)
        ]);

      if (inspectionsError) {
        setMessage("No fue posible consultar los preoperacionales listos para FUEC.");
        setIsLoading(false);
        return;
      }

      if (fuecsError) {
        setMessage("No fue posible consultar los FUEC ya emitidos del dia.");
        setIsLoading(false);
        return;
      }

      const usedInspectionIds = new Set((fuecs ?? []).map((item: any) => item.inspeccion_id));
      const pendingRows: InspectionPendingRecord[] = (inspections ?? [])
        .map((inspection: any) => ({
          id: inspection.id,
          codigo: inspection.codigo,
          fecha_operacion: inspection.fecha_operacion,
          fecha_hora_cierre: inspection.fecha_hora_cierre,
          resultado: inspection.resultado,
          kilometraje: inspection.kilometraje,
          vehiculos: Array.isArray(inspection.vehiculos)
            ? (inspection.vehiculos[0] ?? null)
            : inspection.vehiculos,
          conductores: Array.isArray(inspection.conductores)
            ? (inspection.conductores[0] ?? null)
            : inspection.conductores
        }))
        .filter((inspection) => !usedInspectionIds.has(inspection.id));

      setRecords(pendingRows);
      setIsLoading(false);
    }

    void loadQueue();
  }, []);

  const summaryText = useMemo(() => {
    if (records.length === 0) {
      return "No hay preoperacionales pendientes por convertir en FUEC.";
    }

    return `${records.length} preoperacional(es) del dia listo(s) para FUEC.`;
  }, [records]);

  return (
    <article className="table-card">
      <div className="table-card__header">
        <div>
          <p className="eyebrow">Seguimiento</p>
          <h2>Preoperacionales listos para FUEC</h2>
        </div>
        <p className="muted">{summaryText}</p>
      </div>

      {isLoading ? <p className="muted">Consultando cola pendiente...</p> : null}
      {!isLoading && message ? <p className="admin-alert admin-alert--danger">{message}</p> : null}

      {!isLoading && !message ? (
        records.length === 0 ? (
          <p className="muted">
            Todo lo apto del dia ya tiene FUEC emitido, o no hay inspecciones aptas pendientes.
          </p>
        ) : (
          <div className="table-list">
            {records.map((inspection) => (
              <div className="table-row" key={inspection.id}>
                <div>
                  <strong>{inspection.codigo}</strong>
                  <p className="muted">
                    {inspection.vehiculos?.placa ?? "Sin placa"} |{" "}
                    {inspection.vehiculos?.tipo_vehiculo ?? "Sin tipo"}
                  </p>
                </div>
                <div>
                  <strong>{inspection.conductores?.nombre_completo ?? "Sin conductor"}</strong>
                  <p className="muted">
                    Doc. {inspection.conductores?.documento ?? "Sin documento"} | KM{" "}
                    {inspection.kilometraje}
                  </p>
                </div>
                <div>
                  <span className="status-pill">{inspection.resultado ?? "PENDIENTE"}</span>
                  <p className="muted">{formatDateTime(inspection.fecha_hora_cierre)}</p>
                </div>
              </div>
            ))}
          </div>
        )
      ) : null}
    </article>
  );
}
