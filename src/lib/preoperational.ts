import { buildValidationUrl } from "./document-utils";
import { checklistItems } from "./checklist";
import { getBogotaDate, getBogotaDateCodeParts } from "./date-utils";
import { normalizeEvidenceImage } from "./image-normalization";
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

function toArrayRecord<T>(value: T | T[] | null | undefined) {
  if (!value) {
    return [] as T[];
  }

  return Array.isArray(value) ? value : [value];
}

function splitStoragePath(storagePath: string) {
  const [bucket, ...rest] = storagePath.split("/");

  if (!bucket || rest.length === 0) {
    throw new Error(`La ruta de evidencia ${storagePath} no es valida.`);
  }

  return {
    bucket,
    path: rest.join("/")
  };
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

export async function replaceInspectionEvidence(params: {
  inspectionId: string;
  evidenceType: Exclude<EvidenceType, "FIRMA_CONDUCTOR">;
  evidence: EvidenceUploadState;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const uploaded = await uploadEvidenceFile({
    inspectionId: params.inspectionId,
    evidenceType: params.evidenceType,
    evidence: params.evidence
  });
  const storagePath = `${uploaded.bucket}/${uploaded.path}`;
  const { data: existingEvidence, error: existingError } = await supabase
    .from("inspeccion_evidencias")
    .select("id")
    .eq("inspeccion_id", params.inspectionId)
    .eq("tipo", params.evidenceType)
    .maybeSingle();

  if (existingError) {
    throw existingError;
  }

  const { error } = existingEvidence
    ? await supabase
        .from("inspeccion_evidencias")
        .update({ storage_path: storagePath })
        .eq("id", existingEvidence.id)
    : await supabase.from("inspeccion_evidencias").insert({
        inspeccion_id: params.inspectionId,
        tipo: params.evidenceType,
        storage_path: storagePath
      });

  if (error) {
    throw error;
  }

  return storagePath;
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

async function persistInspectionPdfReferences(params: {
  inspectionId: string;
  verificationCode: string;
  pdfPath: string;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const pdfUrl = `documentos/${params.pdfPath}`;

  const { error: pdfUpdateError } = await supabase
    .from("inspecciones_preoperacionales")
    .update({
      pdf_url: pdfUrl,
      updated_at: new Date().toISOString()
    })
    .eq("id", params.inspectionId);

  if (pdfUpdateError) {
    throw pdfUpdateError;
  }

  const { error: documentUpdateError } = await supabase
    .from("documentos_verificables")
    .update({
      pdf_url: pdfUrl
    })
    .eq("codigo_verificacion", params.verificationCode);

  if (documentUpdateError) {
    throw documentUpdateError;
  }

  return pdfUrl;
}

async function downloadStoredEvidence(storagePath: string) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { bucket, path } = splitStoragePath(storagePath);
  const { data, error } = await supabase.storage.from(bucket).download(path);

  if (error || !data) {
    throw error ?? new Error(`No fue posible descargar la evidencia ${storagePath}.`);
  }

  const fileName = path.split("/").pop() || "evidencia";
  const file = new File([data], fileName, {
    type: data.type || (bucket === "firmas" ? "image/png" : "image/jpeg")
  });

  return {
    fileName,
    file
  } satisfies EvidenceUploadState;
}

export async function regeneratePreoperationalPdf(params: { inspectionId: string }) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspecciones_preoperacionales")
    .select(
      "id, codigo, fecha_operacion, kilometraje, observaciones, resultado, codigo_verificacion, vehiculos(placa, tipo_vehiculo, propietario_afiliado), conductores(documento, nombre_completo), inspeccion_items(item_codigo, valor), inspeccion_evidencias(tipo, storage_path)"
    )
    .eq("id", params.inspectionId)
    .single();

  if (inspectionError || !inspection) {
    throw new Error("No fue posible cargar la inspeccion para regenerar el PDF.");
  }

  if (!inspection.codigo_verificacion) {
    throw new Error("La inspeccion no tiene codigo de verificacion y no se puede regenerar el PDF.");
  }

  if (!inspection.resultado) {
    throw new Error("La inspeccion no tiene resultado final y no se puede regenerar el PDF.");
  }

  const vehicle = toArrayRecord(inspection.vehiculos)[0];
  const driver = toArrayRecord(inspection.conductores)[0];
  const items = toArrayRecord(inspection.inspeccion_items);
  const evidences = toArrayRecord(inspection.inspeccion_evidencias);

  if (!vehicle || !driver) {
    throw new Error("La inspeccion no tiene vehiculo o conductor asociado.");
  }

  const itemValues = Object.fromEntries(
    items.map((item: any) => [item.item_codigo, item.valor ?? ""])
  ) as Record<string, string>;

  const evidenceValues: Partial<Record<EvidenceType, EvidenceUploadState>> = {};

  for (const evidence of evidences) {
    const evidenceType = evidence.tipo as EvidenceType;
    const downloadedEvidence = await downloadStoredEvidence(evidence.storage_path);
    const normalizedFile = downloadedEvidence.file
      ? await normalizeEvidenceImage(downloadedEvidence.file)
      : undefined;
    const normalizedEvidence = normalizedFile
      ? { ...downloadedEvidence, fileName: normalizedFile.name, file: normalizedFile }
      : downloadedEvidence;

    if (normalizedFile && normalizedFile !== downloadedEvidence.file && evidenceType !== "FIRMA_CONDUCTOR") {
      await replaceInspectionEvidence({
        inspectionId: inspection.id,
        evidenceType,
        evidence: normalizedEvidence
      });
    }

    evidenceValues[evidenceType] = normalizedEvidence;
  }

  const pdfBytes = await generatePreoperationalPdf({
    code: inspection.codigo,
    verificationCode: inspection.codigo_verificacion,
    vehicle: {
      placa: vehicle.placa,
      tipoVehiculo: vehicle.tipo_vehiculo ?? "Vehiculo",
      propietarioAfiliado: vehicle.propietario_afiliado ?? ""
    },
    driver: {
      documento: driver.documento,
      nombreCompleto: driver.nombre_completo ?? driver.documento
    },
    kilometraje: inspection.kilometraje,
    observaciones: inspection.observaciones ?? "",
    resultado: inspection.resultado as InspectionResult,
    itemValues,
    evidenceValues,
    fechaOperacion: inspection.fecha_operacion
  });

  const pdfPath = await uploadPdfDocument({
    inspectionId: inspection.id,
    pdfBytes
  });

  await persistInspectionPdfReferences({
    inspectionId: inspection.id,
    verificationCode: inspection.codigo_verificacion,
    pdfPath
  });

  return {
    code: inspection.codigo,
    pdfPath,
    pdfUrl: `documentos/${pdfPath}`
  };
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

  const { data: nextSequence, error: sequenceError } = await supabase.rpc(
    "generar_siguiente_numero_documento",
    {
      p_documento: "PREOPERACIONAL",
      p_anio: Number(year),
      p_prefijo: "GLOBAL"
    }
  );

  if (sequenceError) {
    throw sequenceError;
  }

  const sequence = String(nextSequence).padStart(3, "0");
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

  const { error: itemsError } = await supabase.from("inspeccion_items").insert(itemsPayload);

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

    await persistInspectionPdfReferences({
      inspectionId,
      verificationCode,
      pdfPath
    });

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
