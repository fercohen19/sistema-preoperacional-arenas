import { buildValidationUrl } from "./document-utils";
import { checklistItems } from "./checklist";
import { getBogotaDate, getBogotaDateCodeParts } from "./date-utils";
import { generatePreoperationalPdf } from "./pdf";
import { supabase } from "./supabase";
import type {
  EvidenceType,
  EvidenceUploadState,
  InspectionResult
} from "./types";

function sanitizeFileName(fileName: string) {
  return fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

async function uploadEvidenceFile(params: {
  inspectionId: string;
  evidenceType: EvidenceType;
  evidence: EvidenceUploadState;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { evidence, evidenceType, inspectionId } = params;
  const isSignature = evidenceType === "FIRMA_CONDUCTOR";
  const bucket = isSignature ? "firmas" : "inspecciones";
  const extension = isSignature ? "png" : evidence.fileName.split(".").pop() || "jpg";
  const filePath = `${inspectionId}/${evidenceType}.${sanitizeFileName(extension)}`;

  let fileBody: File | Blob | undefined = evidence.file;

  if (!fileBody && evidence.dataUrl) {
    fileBody = await dataUrlToBlob(evidence.dataUrl);
  }

  if (!fileBody) {
    throw new Error(`No se encontro archivo para ${evidenceType}.`);
  }

  const { error } = await supabase.storage.from(bucket).upload(filePath, fileBody, {
    upsert: true,
    contentType: isSignature ? "image/png" : evidence.file?.type || "image/jpeg"
  });

  if (error) {
    throw error;
  }

  return {
    bucket,
    path: filePath
  };
}

async function uploadPdfDocument(params: {
  inspectionId: string;
  pdfBytes: Uint8Array<ArrayBufferLike>;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const path = `preoperacionales/${params.inspectionId}.pdf`;
  const pdfBuffer = params.pdfBytes.buffer.slice(
    params.pdfBytes.byteOffset,
    params.pdfBytes.byteOffset + params.pdfBytes.byteLength
  ) as ArrayBuffer;
  const { error } = await supabase.storage
    .from("documentos")
    .upload(path, new Blob([pdfBuffer], { type: "application/pdf" }), {
      upsert: true,
      contentType: "application/pdf"
    });

  if (error) {
    throw error;
  }

  return path;
}

export async function savePreoperationalInspection(params: {
  placa: string;
  conductorDocumento: string;
  kilometraje: number;
  observaciones: string;
  resultado: InspectionResult;
  itemValues: Record<string, string>;
  evidenceValues: Partial<Record<EvidenceType, EvidenceUploadState>>;
  onProgress?: (message: string) => void;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const {
    placa,
    conductorDocumento,
    kilometraje,
    onProgress,
    observaciones,
    resultado,
    itemValues,
    evidenceValues
  } = params;

  const reportProgress = (message: string) => {
    onProgress?.(message);
  };

  reportProgress("Validando vehiculo, conductor y sesion...");

  const [
    { data: vehicle, error: vehicleError },
    { data: driver, error: driverError },
    { data: authData, error: authError }
  ] = await Promise.all([
    supabase
      .from("vehiculos")
      .select("id, placa, tipo_vehiculo, propietario_afiliado")
      .eq("placa", placa)
      .single(),
    supabase
      .from("conductores")
      .select("id, documento, nombre_completo")
      .eq("documento", conductorDocumento)
      .single(),
    supabase.auth.getUser()
  ]);

  if (vehicleError || !vehicle) {
    throw new Error("No se encontro el vehiculo seleccionado.");
  }

  if (driverError || !driver) {
    throw new Error("No se encontro el conductor seleccionado.");
  }

  if (authError) {
    throw authError;
  }

  const inspectionId = crypto.randomUUID();
  const verificationCode = crypto.randomUUID().replaceAll("-", "");
  const now = new Date();
  const dateOnly = getBogotaDate(now);
  const { year, month, day } = getBogotaDateCodeParts(now);
  let creatorId: string | null = null;

  if (authData.user?.id) {
    const { data: appUser } = await supabase
      .from("usuarios")
      .select("id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    creatorId = appUser?.id ?? null;
  }

  const { data: existingInspection, error: existingInspectionError } = await supabase
    .from("inspecciones_preoperacionales")
    .select("id, codigo")
    .eq("fecha_operacion", dateOnly)
    .eq("vehiculo_id", vehicle.id)
    .eq("conductor_id", driver.id)
    .maybeSingle();

  if (existingInspectionError) {
    throw existingInspectionError;
  }

  if (existingInspection) {
    throw new Error(
      `Ya existe una inspeccion para ${placa} con este conductor en la fecha ${dateOnly}. Codigo existente: ${existingInspection.codigo}.`
    );
  }

  const { count: sameDayCount, error: countError } = await supabase
    .from("inspecciones_preoperacionales")
    .select("*", { count: "exact", head: true })
    .eq("fecha_operacion", dateOnly);

  if (countError) {
    throw countError;
  }

  const sequence = String((sameDayCount ?? 0) + 1).padStart(3, "0");
  const code = `PO-${year}-${day}${month}${sequence}`;

  const { error: inspectionError } = await supabase
    .from("inspecciones_preoperacionales")
    .insert({
      id: inspectionId,
      codigo: code,
      fecha_operacion: dateOnly,
      fecha_hora_cierre: now.toISOString(),
      vehiculo_id: vehicle.id,
      conductor_id: driver.id,
      kilometraje,
      observaciones: observaciones || null,
      resultado,
      codigo_verificacion: verificationCode,
      qr_url: buildValidationUrl(verificationCode),
      creada_por: creatorId,
      cerrada: true
    });

  if (inspectionError) {
    throw inspectionError;
  }

  reportProgress("Inspeccion guardada. Registrando checklist y evidencias...");

  const itemsPayload = checklistItems.map((item) => ({
    inspeccion_id: inspectionId,
    item_codigo: item.codigo,
    item_nombre: item.nombre,
    valor: itemValues[item.codigo] ?? "",
    es_falla_critica: item.critico
  }));

  const { error: itemsError } = await supabase
    .from("inspeccion_items")
    .insert(itemsPayload);

  if (itemsError) {
    throw itemsError;
  }

  const evidenceRows = [];

  for (const [evidenceType, evidence] of Object.entries(evidenceValues) as Array<
    [EvidenceType, EvidenceUploadState | undefined]
  >) {
    if (!evidence) {
      continue;
    }

    const uploaded = await uploadEvidenceFile({
      inspectionId,
      evidenceType,
      evidence
    });

    evidenceRows.push({
      inspeccion_id: inspectionId,
      tipo: evidenceType,
      storage_path: `${uploaded.bucket}/${uploaded.path}`
    });
  }

  if (evidenceRows.length > 0) {
    const { error: evidenceError } = await supabase
      .from("inspeccion_evidencias")
      .insert(evidenceRows);

    if (evidenceError) {
      throw evidenceError;
    }
  }

  const { error: documentError } = await supabase.from("documentos_verificables").insert({
    tipo: "PREOPERACIONAL",
    entidad_id: inspectionId,
    codigo_verificacion: verificationCode,
    estado: "VIGENTE"
  });

  if (documentError) {
    throw documentError;
  }

  let pdfPath: string | null = null;
  let pdfGenerated = false;
  let pdfErrorMessage: string | null = null;

  try {
    reportProgress("Generando PDF del preoperacional...");

    const pdfBytes = await generatePreoperationalPdf({
      code,
      verificationCode,
      vehicle: {
        placa: vehicle.placa,
        tipoVehiculo: vehicle.tipo_vehiculo ?? "Vehiculo",
        propietarioAfiliado: vehicle.propietario_afiliado ?? ""
      },
      driver: {
        documento: driver.documento,
        nombreCompleto: driver.nombre_completo ?? driver.documento
      },
      kilometraje,
      observaciones,
      resultado,
      itemValues,
      evidenceValues,
      fechaOperacion: dateOnly
    });

    reportProgress("Subiendo PDF generado...");

    pdfPath = await uploadPdfDocument({
      inspectionId,
      pdfBytes
    });

    const { error: pdfUpdateError } = await supabase
      .from("inspecciones_preoperacionales")
      .update({
        pdf_url: `documentos/${pdfPath}`,
        updated_at: new Date().toISOString()
      })
      .eq("id", inspectionId);

    if (pdfUpdateError) {
      throw pdfUpdateError;
    }

    const { error: documentUpdateError } = await supabase
      .from("documentos_verificables")
      .update({
        pdf_url: `documentos/${pdfPath}`
      })
      .eq("codigo_verificacion", verificationCode);

    if (documentUpdateError) {
      throw documentUpdateError;
    }

    pdfGenerated = true;
  } catch (error) {
    pdfErrorMessage =
      error instanceof Error ? error.message : "No fue posible generar el PDF en este intento.";
  }

  return {
    inspectionId,
    code,
    verificationCode,
    pdfGenerated,
    pdfErrorMessage,
    pdfPath
  };
}
