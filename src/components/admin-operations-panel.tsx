"use client";

import { useEffect, useMemo, useState } from "react";
import { contractRecords, findContractByNumber } from "@/lib/contracts";
import { buildValidationUrl } from "@/lib/document-utils";
import { supabase } from "@/lib/supabase";

type InspectionRecord = {
  id: string;
  codigo: string;
  fecha_operacion: string;
  fecha_hora_cierre: string | null;
  kilometraje: number;
  resultado: string | null;
  cerrada: boolean;
  pdf_url: string | null;
  codigo_verificacion: string | null;
  creador: { nombre_completo: string } | null;
  vehiculos: { placa: string; tipo_vehiculo: string } | null;
  conductores: { nombre_completo: string; documento: string } | null;
};

type FuecRecord = {
  id: string;
  consecutivo: string;
  fecha_emision: string;
  fecha_servicio: string | null;
  contrato_referencia: string | null;
  inspeccion_id: string;
  estado: string;
  pdf_url: string | null;
  codigo_verificacion: string | null;
  emisor: { nombre_completo: string } | null;
  vehiculos: { placa: string; tipo_vehiculo: string } | null;
  conductores: { nombre_completo: string; documento: string } | null;
};

type FilterState = {
  text: string;
  startDate: string;
  endDate: string;
  contractor: string;
  status: string;
};

type SignedUrlMap = Record<string, string>;

type InspectionView = InspectionRecord & {
  contractors: string[];
};

type FuecView = FuecRecord & {
  contractorName: string;
  contractorDocument: string;
};

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

function normalizeText(value: string) {
  return value.trim().toLowerCase();
}

function extractStoragePath(pdfUrl: string | null) {
  if (!pdfUrl) {
    return null;
  }

  return pdfUrl.startsWith("documentos/") ? pdfUrl.replace(/^documentos\//, "") : pdfUrl;
}

function isWithinRange(value: string | null, startDate: string, endDate: string) {
  if (!value) {
    return false;
  }

  if (startDate && value < startDate) {
    return false;
  }

  if (endDate && value > endDate) {
    return false;
  }

  return true;
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

async function createSignedUrls(paths: Array<string | null>) {
  if (!supabase) {
    return {} satisfies SignedUrlMap;
  }

  const client = supabase;
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => Boolean(path))));

  if (uniquePaths.length === 0) {
    return {} satisfies SignedUrlMap;
  }

  const entries = await Promise.all(
    uniquePaths.map(async (path) => {
      const { data, error } = await client.storage.from("documentos").createSignedUrl(path, 3600);
      return [path, !error ? data.signedUrl : ""] as const;
    })
  );

  return Object.fromEntries(entries);
}

export function AdminOperationsPanel() {
  const [inspectionFilter, setInspectionFilter] = useState<FilterState>({
    text: "",
    startDate: "",
    endDate: "",
    contractor: "",
    status: ""
  });
  const [fuecFilter, setFuecFilter] = useState<FilterState>({
    text: "",
    startDate: "",
    endDate: "",
    contractor: "",
    status: ""
  });
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [fuecs, setFuecs] = useState<FuecRecord[]>([]);
  const [inspectionPdfUrls, setInspectionPdfUrls] = useState<SignedUrlMap>({});
  const [fuecPdfUrls, setFuecPdfUrls] = useState<SignedUrlMap>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    async function loadAdminData() {
      if (!supabase) {
        setLoadError("Supabase no esta configurado para consultar el historial.");
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setLoadError("");

      const [{ data: inspectionRows, error: inspectionError }, { data: fuecRows, error: fuecError }] =
        await Promise.all([
          supabase
            .from("inspecciones_preoperacionales")
            .select(
              "id, codigo, fecha_operacion, fecha_hora_cierre, kilometraje, resultado, cerrada, pdf_url, codigo_verificacion, creador:usuarios!inspecciones_preoperacionales_creada_por_fkey(nombre_completo), vehiculos(placa, tipo_vehiculo), conductores(nombre_completo, documento)"
            )
            .order("created_at", { ascending: false })
            .limit(300),
          supabase
            .from("fuecs")
            .select(
              "id, consecutivo, fecha_emision, fecha_servicio, contrato_referencia, inspeccion_id, estado, pdf_url, codigo_verificacion, emisor:usuarios!fuecs_emitido_por_fkey(nombre_completo), vehiculos(placa, tipo_vehiculo), conductores(nombre_completo, documento)"
            )
            .order("created_at", { ascending: false })
            .limit(300)
        ]);

      if (inspectionError) {
        setLoadError("No fue posible cargar el historial de preoperacionales.");
        setIsLoading(false);
        return;
      }

      if (fuecError) {
        setLoadError("No fue posible cargar el historial de FUEC.");
        setIsLoading(false);
        return;
      }

      const inspectionData: InspectionRecord[] = (inspectionRows ?? []).map((inspection: any) => ({
        id: inspection.id,
        codigo: inspection.codigo,
        fecha_operacion: inspection.fecha_operacion,
        fecha_hora_cierre: inspection.fecha_hora_cierre,
        kilometraje: inspection.kilometraje,
        resultado: inspection.resultado,
        cerrada: inspection.cerrada,
        pdf_url: inspection.pdf_url,
        codigo_verificacion: inspection.codigo_verificacion,
        creador: Array.isArray(inspection.creador) ? (inspection.creador[0] ?? null) : inspection.creador,
        vehiculos: Array.isArray(inspection.vehiculos) ? (inspection.vehiculos[0] ?? null) : inspection.vehiculos,
        conductores: Array.isArray(inspection.conductores)
          ? (inspection.conductores[0] ?? null)
          : inspection.conductores
      }));

      const fuecData: FuecRecord[] = (fuecRows ?? []).map((fuec: any) => ({
        id: fuec.id,
        consecutivo: fuec.consecutivo,
        fecha_emision: fuec.fecha_emision,
        fecha_servicio: fuec.fecha_servicio,
        contrato_referencia: fuec.contrato_referencia,
        inspeccion_id: fuec.inspeccion_id,
        estado: fuec.estado,
        pdf_url: fuec.pdf_url,
        codigo_verificacion: fuec.codigo_verificacion,
        emisor: Array.isArray(fuec.emisor) ? (fuec.emisor[0] ?? null) : fuec.emisor,
        vehiculos: Array.isArray(fuec.vehiculos) ? (fuec.vehiculos[0] ?? null) : fuec.vehiculos,
        conductores: Array.isArray(fuec.conductores)
          ? (fuec.conductores[0] ?? null)
          : fuec.conductores
      }));

      setInspections(inspectionData);
      setFuecs(fuecData);

      const [inspectionUrls, fuecUrls] = await Promise.all([
        createSignedUrls(inspectionData.map((row) => extractStoragePath(row.pdf_url))),
        createSignedUrls(fuecData.map((row) => extractStoragePath(row.pdf_url)))
      ]);

      setInspectionPdfUrls(inspectionUrls);
      setFuecPdfUrls(fuecUrls);
      setIsLoading(false);
    }

    void loadAdminData();
  }, []);

  const contractorOptions = useMemo(
    () =>
      Array.from(
        new Set(
          contractRecords
            .map((contract) => contract.nombreSuscritoContrato.trim())
            .filter(Boolean)
        )
      ).sort((left, right) => left.localeCompare(right, "es-CO")),
    []
  );

  const fuecViews = useMemo<FuecView[]>(
    () =>
      fuecs.map((fuec) => {
        const contract = fuec.contrato_referencia
          ? findContractByNumber(fuec.contrato_referencia)
          : null;

        return {
          ...fuec,
          contractorName: contract?.nombreSuscritoContrato ?? "",
          contractorDocument: contract?.documentoContratante ?? ""
        };
      }),
    [fuecs]
  );

  const inspectionViews = useMemo<InspectionView[]>(
    () =>
      inspections.map((inspection) => {
        const contractors = Array.from(
          new Set(
            fuecViews
              .filter((fuec) => fuec.inspeccion_id === inspection.id)
              .map((fuec) => fuec.contractorName)
              .filter(Boolean)
          )
        );

        return {
          ...inspection,
          contractors
        };
      }),
    [fuecViews, inspections]
  );

  const filteredInspections = useMemo(() => {
    const text = normalizeText(inspectionFilter.text);

    return inspectionViews.filter((inspection) => {
      const haystack = normalizeText(
        [
          inspection.codigo,
          inspection.vehiculos?.placa ?? "",
          inspection.conductores?.nombre_completo ?? "",
          inspection.conductores?.documento ?? "",
          inspection.resultado ?? "",
          inspection.contractors.join(" ")
        ].join(" ")
      );

      const matchesText = !text || haystack.includes(text);
      const matchesDate = isWithinRange(
        inspection.fecha_operacion,
        inspectionFilter.startDate,
        inspectionFilter.endDate
      );
      const matchesStatus =
        !inspectionFilter.status || (inspection.resultado ?? "") === inspectionFilter.status;
      const matchesContractor =
        !inspectionFilter.contractor || inspection.contractors.includes(inspectionFilter.contractor);

      return matchesText && matchesDate && matchesStatus && matchesContractor;
    });
  }, [inspectionFilter, inspectionViews]);

  const filteredFuecs = useMemo(() => {
    const text = normalizeText(fuecFilter.text);

    return fuecViews.filter((fuec) => {
      const haystack = normalizeText(
        [
          fuec.consecutivo,
          fuec.contrato_referencia ?? "",
          fuec.contractorName,
          fuec.contractorDocument,
          fuec.vehiculos?.placa ?? "",
          fuec.conductores?.nombre_completo ?? "",
          fuec.conductores?.documento ?? "",
          fuec.estado
        ].join(" ")
      );

      const dateValue = fuec.fecha_servicio ?? fuec.fecha_emision.slice(0, 10);
      const matchesText = !text || haystack.includes(text);
      const matchesDate = isWithinRange(dateValue, fuecFilter.startDate, fuecFilter.endDate);
      const matchesStatus = !fuecFilter.status || fuec.estado === fuecFilter.status;
      const matchesContractor =
        !fuecFilter.contractor || fuec.contractorName === fuecFilter.contractor;

      return matchesText && matchesDate && matchesStatus && matchesContractor;
    });
  }, [fuecFilter, fuecViews]);

  const stats = useMemo(
    () => ({
      closedInspections: inspections.filter((inspection) => inspection.cerrada).length,
      aptInspections: inspections.filter((inspection) =>
        ["APTO", "APTO_CON_OBSERVACION"].includes(inspection.resultado ?? "")
      ).length,
      emittedFuecs: fuecs.filter((fuec) => fuec.estado === "EMITIDO").length
    }),
    [fuecs, inspections]
  );

  async function exportRowsToExcel(
    kind: "preoperacionales" | "fuecs",
    rows: InspectionView[] | FuecView[]
  ) {
    if (rows.length === 0) {
      setLoadError(`No hay ${kind} para exportar con los filtros actuales.`);
      return;
    }

    const XLSX = await import("xlsx");
    const workbook = XLSX.utils.book_new();
    const data =
      kind === "preoperacionales"
        ? (rows as InspectionView[]).map((inspection) => ({
            Codigo: inspection.codigo,
            FechaOperacion: inspection.fecha_operacion,
            FechaCierre: inspection.fecha_hora_cierre ?? "",
            Placa: inspection.vehiculos?.placa ?? "",
            TipoVehiculo: inspection.vehiculos?.tipo_vehiculo ?? "",
            Conductor: inspection.conductores?.nombre_completo ?? "",
            DocumentoConductor: inspection.conductores?.documento ?? "",
            Kilometraje: inspection.kilometraje,
            Resultado: inspection.resultado ?? "",
            Cerrada: inspection.cerrada ? "SI" : "NO",
            Contratantes: inspection.contractors.join(" | "),
            CodigoValidacion: inspection.codigo_verificacion ?? "",
            Pdf: inspection.pdf_url ?? ""
          }))
        : (rows as FuecView[]).map((fuec) => ({
            Consecutivo: fuec.consecutivo,
            FechaEmision: fuec.fecha_emision,
            FechaServicio: fuec.fecha_servicio ?? "",
            ContratoReferencia: fuec.contrato_referencia ?? "",
            Contratante: fuec.contractorName,
            DocumentoContratante: fuec.contractorDocument,
            Placa: fuec.vehiculos?.placa ?? "",
            TipoVehiculo: fuec.vehiculos?.tipo_vehiculo ?? "",
            Conductor: fuec.conductores?.nombre_completo ?? "",
            DocumentoConductor: fuec.conductores?.documento ?? "",
            Estado: fuec.estado,
            CodigoValidacion: fuec.codigo_verificacion ?? "",
            Pdf: fuec.pdf_url ?? ""
          }));

    const sheet = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, sheet, kind === "preoperacionales" ? "Preoperacionales" : "FUEC");
    XLSX.writeFile(workbook, `${kind}-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function exportMergedPdf(
    kind: "preoperacionales" | "fuecs",
    rows: InspectionView[] | FuecView[],
    signedMap: SignedUrlMap
  ) {
    if (rows.length === 0) {
      setLoadError(`No hay ${kind} para exportar con los filtros actuales.`);
      return;
    }

    const pdfEntries = rows
      .map((row) => {
        const path = extractStoragePath(row.pdf_url);
        return {
          path,
          signedUrl: path ? signedMap[path] : ""
        };
      })
      .filter((entry) => entry.path && entry.signedUrl);

    if (pdfEntries.length === 0) {
      setLoadError(`No se encontraron PDFs disponibles para ${kind}.`);
      return;
    }

    setIsExporting(true);
    setLoadError("");

    try {
      const { PDFDocument } = await import("pdf-lib");
      const mergedPdf = await PDFDocument.create();

      for (const entry of pdfEntries) {
        const response = await fetch(entry.signedUrl);
        const bytes = await response.arrayBuffer();
        const sourcePdf = await PDFDocument.load(bytes);
        const copiedPages = await mergedPdf.copyPages(sourcePdf, sourcePdf.getPageIndices());

        for (const page of copiedPages) {
          mergedPdf.addPage(page);
        }
      }

      const mergedBytes = await mergedPdf.save();
      const mergedBuffer = mergedBytes.buffer.slice(
        mergedBytes.byteOffset,
        mergedBytes.byteOffset + mergedBytes.byteLength
      ) as ArrayBuffer;
      downloadBlob(
        new Blob([mergedBuffer], { type: "application/pdf" }),
        `${kind}-bloque-${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="stack-lg">
      <div className="stats-grid">
        <article className="stat-card">
          <p className="eyebrow">Preoperacionales</p>
          <h3>{stats.closedInspections} cerrados</h3>
          <p className="muted">Ultimos registros cerrados en la base real.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">Aptos</p>
          <h3>{stats.aptInspections} habilitantes</h3>
          <p className="muted">Con resultado valido para liberar FUEC.</p>
        </article>
        <article className="stat-card">
          <p className="eyebrow">FUEC</p>
          <h3>{stats.emittedFuecs} emitidos</h3>
          <p className="muted">Con PDF generado y trazabilidad administrativa.</p>
        </article>
      </div>

      {loadError ? <p className="admin-alert admin-alert--danger">{loadError}</p> : null}
      {isLoading ? <p className="muted">Cargando historial administrativo...</p> : null}

      <article className="table-card">
        <div className="table-card__header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>Preoperacionales</h2>
          </div>
          <p className="muted">{filteredInspections.length} registro(s)</p>
        </div>

        <div className="admin-filters">
          <input
            onChange={(event) =>
              setInspectionFilter((current) => ({ ...current, text: event.target.value }))
            }
            placeholder="Buscar por codigo, placa o conductor"
            type="text"
            value={inspectionFilter.text}
          />
          <input
            onChange={(event) =>
              setInspectionFilter((current) => ({ ...current, startDate: event.target.value }))
            }
            type="date"
            value={inspectionFilter.startDate}
          />
          <input
            onChange={(event) =>
              setInspectionFilter((current) => ({ ...current, endDate: event.target.value }))
            }
            type="date"
            value={inspectionFilter.endDate}
          />
          <select
            className="select-field"
            onChange={(event) =>
              setInspectionFilter((current) => ({ ...current, contractor: event.target.value }))
            }
            value={inspectionFilter.contractor}
          >
            <option value="">Todos los contratantes</option>
            {contractorOptions.map((contractor) => (
              <option key={contractor} value={contractor}>
                {contractor}
              </option>
            ))}
          </select>
          <select
            className="select-field"
            onChange={(event) =>
              setInspectionFilter((current) => ({ ...current, status: event.target.value }))
            }
            value={inspectionFilter.status}
          >
            <option value="">Todos los resultados</option>
            <option value="APTO">APTO</option>
            <option value="APTO_CON_OBSERVACION">APTO_CON_OBSERVACION</option>
            <option value="NO_APTO">NO_APTO</option>
          </select>
        </div>

        <div className="action-row admin-actions">
          <button
            className="secondary-button"
            disabled={isExporting || filteredInspections.length === 0}
            onClick={() => void exportRowsToExcel("preoperacionales", filteredInspections)}
            type="button"
          >
            Exportar Excel
          </button>
          <button
            className="primary-button"
            disabled={isExporting || filteredInspections.length === 0}
            onClick={() =>
              void exportMergedPdf("preoperacionales", filteredInspections, inspectionPdfUrls)
            }
            type="button"
          >
            {isExporting ? "Preparando PDFs..." : "Exportar PDFs"}
          </button>
        </div>

        <div className="admin-history-list">
          {filteredInspections.length === 0 ? (
            <p className="muted">No hay preoperacionales que coincidan con los filtros.</p>
          ) : (
            filteredInspections.map((inspection) => {
              const pdfPath = extractStoragePath(inspection.pdf_url);
              const pdfHref = pdfPath ? inspectionPdfUrls[pdfPath] : "";

              return (
                <div className="admin-history-row" key={inspection.id}>
                  <div className="admin-history-main">
                    <strong>{inspection.codigo}</strong>
                    <p className="muted">
                      {inspection.vehiculos?.placa ?? "Sin placa"} -{" "}
                      {inspection.conductores?.nombre_completo ?? "Sin conductor"}
                    </p>
                    <p className="muted">
                      {formatDate(inspection.fecha_operacion)} | {inspection.resultado ?? "Sin resultado"}
                    </p>
                    <p className="muted">
                      Contratante: {inspection.contractors.join(" | ") || "Sin FUEC asociado"}
                    </p>
                    <p className="muted">
                      Diligenciado por: {inspection.creador?.nombre_completo ?? "Sin trazabilidad"}
                    </p>
                  </div>
                  <div className="admin-history-meta">
                    <span className="status-pill">{inspection.resultado ?? "PENDIENTE"}</span>
                    <span className="muted">KM {inspection.kilometraje}</span>
                    <span className="muted">{formatDateTime(inspection.fecha_hora_cierre)}</span>
                  </div>
                  <div className="admin-history-actions">
                    {inspection.codigo_verificacion ? (
                      <a
                        className="secondary-button admin-link-button"
                        href={buildValidationUrl(inspection.codigo_verificacion)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Validar
                      </a>
                    ) : null}
                    {pdfHref ? (
                      <a
                        className="primary-button admin-link-button"
                        href={pdfHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Abrir PDF
                      </a>
                    ) : (
                      <span className="muted">Sin PDF</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>

      <article className="table-card">
        <div className="table-card__header">
          <div>
            <p className="eyebrow">Historial</p>
            <h2>FUEC emitidos</h2>
          </div>
          <p className="muted">{filteredFuecs.length} registro(s)</p>
        </div>

        <div className="admin-filters">
          <input
            onChange={(event) =>
              setFuecFilter((current) => ({ ...current, text: event.target.value }))
            }
            placeholder="Buscar por consecutivo, contrato, placa o conductor"
            type="text"
            value={fuecFilter.text}
          />
          <input
            onChange={(event) =>
              setFuecFilter((current) => ({ ...current, startDate: event.target.value }))
            }
            type="date"
            value={fuecFilter.startDate}
          />
          <input
            onChange={(event) =>
              setFuecFilter((current) => ({ ...current, endDate: event.target.value }))
            }
            type="date"
            value={fuecFilter.endDate}
          />
          <select
            className="select-field"
            onChange={(event) =>
              setFuecFilter((current) => ({ ...current, contractor: event.target.value }))
            }
            value={fuecFilter.contractor}
          >
            <option value="">Todos los contratantes</option>
            {contractorOptions.map((contractor) => (
              <option key={contractor} value={contractor}>
                {contractor}
              </option>
            ))}
          </select>
          <select
            className="select-field"
            onChange={(event) =>
              setFuecFilter((current) => ({ ...current, status: event.target.value }))
            }
            value={fuecFilter.status}
          >
            <option value="">Todos los estados</option>
            <option value="EMITIDO">EMITIDO</option>
            <option value="ANULADO">ANULADO</option>
          </select>
        </div>

        <div className="action-row admin-actions">
          <button
            className="secondary-button"
            disabled={isExporting || filteredFuecs.length === 0}
            onClick={() => void exportRowsToExcel("fuecs", filteredFuecs)}
            type="button"
          >
            Exportar Excel
          </button>
          <button
            className="primary-button"
            disabled={isExporting || filteredFuecs.length === 0}
            onClick={() => void exportMergedPdf("fuecs", filteredFuecs, fuecPdfUrls)}
            type="button"
          >
            {isExporting ? "Preparando PDFs..." : "Exportar PDFs"}
          </button>
        </div>

        <div className="admin-history-list">
          {filteredFuecs.length === 0 ? (
            <p className="muted">No hay FUEC que coincidan con los filtros.</p>
          ) : (
            filteredFuecs.map((fuec) => {
              const pdfPath = extractStoragePath(fuec.pdf_url);
              const pdfHref = pdfPath ? fuecPdfUrls[pdfPath] : "";

              return (
                <div className="admin-history-row" key={fuec.id}>
                  <div className="admin-history-main">
                    <strong>{fuec.consecutivo}</strong>
                    <p className="muted">
                      Contrato {fuec.contrato_referencia ?? "Sin referencia"} |{" "}
                      {fuec.vehiculos?.placa ?? "Sin placa"}
                    </p>
                    <p className="muted">
                      {fuec.conductores?.nombre_completo ?? "Sin conductor"} | Servicio{" "}
                      {formatDate(fuec.fecha_servicio)}
                    </p>
                    <p className="muted">
                      Contratante: {fuec.contractorName || "Sin contratante"}
                    </p>
                    <p className="muted">
                      Emitido por: {fuec.emisor?.nombre_completo ?? "Sin trazabilidad"}
                    </p>
                  </div>
                  <div className="admin-history-meta">
                    <span className="status-pill">{fuec.estado}</span>
                    <span className="muted">{formatDateTime(fuec.fecha_emision)}</span>
                  </div>
                  <div className="admin-history-actions">
                    {fuec.codigo_verificacion ? (
                      <a
                        className="secondary-button admin-link-button"
                        href={buildValidationUrl(fuec.codigo_verificacion)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Validar
                      </a>
                    ) : null}
                    {pdfHref ? (
                      <a
                        className="primary-button admin-link-button"
                        href={pdfHref}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Abrir PDF
                      </a>
                    ) : (
                      <span className="muted">Sin PDF</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </article>
    </div>
  );
}
