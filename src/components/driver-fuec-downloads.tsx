"use client";

import { useEffect, useState } from "react";
import { buildValidationUrl } from "@/lib/document-utils";
import { useCurrentAppUser } from "@/lib/current-user";
import { supabase } from "@/lib/supabase";

type DriverFuecRecord = {
  id: string;
  consecutivo: string;
  fecha_emision: string;
  fecha_servicio: string | null;
  estado: string;
  pdf_url: string | null;
  codigo_verificacion: string | null;
  contrato_referencia: string | null;
  vehiculos: { placa: string; tipo_vehiculo: string } | null;
};

function extractStoragePath(pdfUrl: string | null) {
  if (!pdfUrl) {
    return null;
  }

  return pdfUrl.startsWith("documentos/") ? pdfUrl.replace(/^documentos\//, "") : pdfUrl;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Sin fecha";
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

function formatDate(value: string | null) {
  if (!value) {
    return "Sin fecha";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("es-CO", {
    dateStyle: "medium",
    timeZone: "America/Bogota"
  }).format(date);
}

export function DriverFuecDownloads() {
  const { user, loading } = useCurrentAppUser();
  const [records, setRecords] = useState<DriverFuecRecord[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadFuecs() {
      if (!supabase) {
        setMessage("Supabase no esta configurado para consultar los FUEC.");
        setIsLoading(false);
        return;
      }

      const client = supabase;

      if (!user?.documento) {
        setRecords([]);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setMessage("");

      const { data: driver, error: driverError } = await client
        .from("conductores")
        .select("id")
        .eq("documento", user.documento)
        .maybeSingle();

      if (driverError || !driver) {
        setMessage("No fue posible identificar el conductor para consultar sus FUEC.");
        setIsLoading(false);
        return;
      }

      const { data: rows, error } = await client
        .from("fuecs")
        .select(
          "id, consecutivo, fecha_emision, fecha_servicio, estado, pdf_url, codigo_verificacion, contrato_referencia, vehiculos(placa, tipo_vehiculo)"
        )
        .eq("conductor_id", driver.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        setMessage("No fue posible cargar los FUEC emitidos para este conductor.");
        setIsLoading(false);
        return;
      }

      const nextRecords: DriverFuecRecord[] = (rows ?? []).map((row: any) => ({
        id: row.id,
        consecutivo: row.consecutivo,
        fecha_emision: row.fecha_emision,
        fecha_servicio: row.fecha_servicio,
        estado: row.estado,
        pdf_url: row.pdf_url,
        codigo_verificacion: row.codigo_verificacion,
        contrato_referencia: row.contrato_referencia,
        vehiculos: Array.isArray(row.vehiculos) ? (row.vehiculos[0] ?? null) : row.vehiculos
      }));

      const uniquePaths = Array.from(
        new Set(
          nextRecords
            .map((record) => extractStoragePath(record.pdf_url))
            .filter((path): path is string => Boolean(path))
        )
      );

      const urlEntries = await Promise.all(
        uniquePaths.map(async (path) => {
          const { data } = await client.storage.from("documentos").createSignedUrl(path, 3600);
          return [path, data?.signedUrl ?? ""] as const;
        })
      );

      setSignedUrls(Object.fromEntries(urlEntries));
      setRecords(nextRecords);
      setIsLoading(false);
    }

    if (!loading) {
      void loadFuecs();
    }
  }, [loading, user]);

  return (
    <article className="table-card">
      <div className="table-card__header">
        <div>
          <p className="eyebrow">Documentos</p>
          <h2>Mis FUEC emitidos</h2>
        </div>
        <p className="muted">Solo se muestran los asociados a tu documento.</p>
      </div>

      {isLoading ? <p className="muted">Consultando FUEC emitidos...</p> : null}
      {!isLoading && message ? <p className="admin-alert admin-alert--danger">{message}</p> : null}
      {!isLoading && !message && records.length === 0 ? (
        <p className="muted">
          Aun no hay FUEC emitidos para este conductor. La emision la realiza administracion y
          cuando quede generado aparecera aqui para abrirlo o descargarlo.
        </p>
      ) : null}

      {!isLoading && records.length > 0 ? (
        <div className="admin-history-list">
          {records.map((record) => {
            const pdfPath = extractStoragePath(record.pdf_url);
            const pdfHref = pdfPath ? signedUrls[pdfPath] : "";

            return (
              <div className="admin-history-row" key={record.id}>
                <div className="admin-history-main">
                  <strong>{record.consecutivo}</strong>
                  <p className="muted">
                    Contrato {record.contrato_referencia ?? "Sin referencia"} |{" "}
                    {record.vehiculos?.placa ?? "Sin placa"}
                  </p>
                  <p className="muted">
                    Servicio {formatDate(record.fecha_servicio)} | Emision{" "}
                    {formatDateTime(record.fecha_emision)}
                  </p>
                </div>
                <div className="admin-history-meta">
                  <span className="status-pill">{record.estado}</span>
                </div>
                <div className="admin-history-actions">
                  {record.codigo_verificacion ? (
                    <a
                      className="secondary-button admin-link-button"
                      href={buildValidationUrl(record.codigo_verificacion)}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Validar
                    </a>
                  ) : null}
                  {pdfHref ? (
                    <a
                      className="primary-button admin-link-button"
                      download={`${record.consecutivo}.pdf`}
                      href={pdfHref}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Descargar PDF
                    </a>
                  ) : (
                    <span className="muted">PDF pendiente</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
