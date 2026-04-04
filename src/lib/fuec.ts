import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { findContractByNumber, type ContractRecord } from "./contracts";
import { buildValidationUrl } from "./document-utils";
import { getBogotaDate, getBogotaDateCodeParts } from "./date-utils";
import { supabase } from "./supabase";

function isExpiredDate(value: string | null) {
  if (!value) {
    return false;
  }

  const expiry = new Date(`${value}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) {
    return false;
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const expiryDay = new Date(expiry.getFullYear(), expiry.getMonth(), expiry.getDate());
  return expiryDay.getTime() < today.getTime();
}

function drawCell(params: {
  page: import("pdf-lib").PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  value: string;
  labelFont: import("pdf-lib").PDFFont;
  valueFont: import("pdf-lib").PDFFont;
  labelSize?: number;
  valueSize?: number;
}) {
  const {
    page,
    x,
    y,
    width,
    height,
    label,
    value,
    labelFont,
    valueFont,
    labelSize = 8,
    valueSize = 9.2
  } = params;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1
  });

  if (label) {
    page.drawText(label, {
      x: x + 6,
      y: y + height - 12,
      size: labelSize,
      font: labelFont,
      color: rgb(0.12, 0.12, 0.12)
    });
  }

  page.drawText(value, {
    x: x + 6,
    y: y + 8,
    size: valueSize,
    font: valueFont,
    color: rgb(0.1, 0.1, 0.1)
  });
}

function fitText(text: string, max = 120) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function wrapText(text: string, maxCharsPerLine: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharsPerLine) {
      current = candidate;
    } else {
      if (current) {
        lines.push(current);
      }
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function drawParagraphCell(params: {
  page: import("pdf-lib").PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  text: string;
  labelFont: import("pdf-lib").PDFFont;
  valueFont: import("pdf-lib").PDFFont;
  maxCharsPerLine: number;
  valueSize?: number;
  lineGap?: number;
}) {
  const {
    page,
    x,
    y,
    width,
    height,
    label,
    text,
    labelFont,
    valueFont,
    maxCharsPerLine,
    valueSize = 8.6,
    lineGap = 3
  } = params;

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1
  });

  page.drawText(label, {
    x: x + 6,
    y: y + height - 12,
    size: 8,
    font: labelFont,
    color: rgb(0.12, 0.12, 0.12)
  });

  let lineY = y + height - 30;
  for (const line of wrapText(text, maxCharsPerLine).slice(0, 6)) {
    page.drawText(line, {
      x: x + 6,
      y: lineY,
      size: valueSize,
      font: valueFont,
      color: rgb(0.1, 0.1, 0.1)
    });
    lineY -= valueSize + lineGap;
  }
}

async function generateFuecPdf(params: {
  consecutivo: string;
  fechaEmision: string;
  logos: {
    empresa: Uint8Array<ArrayBufferLike>;
    ministerio: Uint8Array<ArrayBufferLike>;
    supertransporte: Uint8Array<ArrayBufferLike>;
  };
  placa: string;
  tipoVehiculo: string;
  conductor: string;
  documento: string;
  numeroLicencia: string;
  vigenciaLicencia: string;
  contrato: ContractRecord;
  razonSocial: string;
  nit: string;
  fechaInicio: string;
  fechaFin: string;
  contratoNo: string;
  fechaServicio: string;
  verificationCode: string;
}) {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595, 842]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const companyLogo = await pdfDoc.embedPng(params.logos.empresa);
  const ministryLogo = await pdfDoc.embedPng(params.logos.ministerio);
  const superLogo = await pdfDoc.embedPng(params.logos.supertransporte);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: 547,
    height: 794,
    borderColor: rgb(0.84, 0.86, 0.88),
    borderWidth: 1
  });

  page.drawRectangle({
    x: 36,
    y: 718,
    width: 523,
    height: 86,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1
  });

  page.drawImage(superLogo, { x: 50, y: 757, width: 96, height: 24 });
  page.drawImage(ministryLogo, { x: 173, y: 754, width: 92, height: 28 });
  page.drawImage(companyLogo, { x: 454, y: 753, width: 84, height: 32 });

  const titleLine1 = "FORMATO UNICO DE EXTRACTO DEL CONTRATO DEL SERVICIO PUBLICO";
  const titleLine2 = "DE TRANSPORTE TERRESTRE AUTOMOTOR ESPECIAL SEGUN RESOLUCION No 0006652 27/12/2019";
  const titleSize = 7;
  const titleCenterX = 297.5;

  page.drawText(titleLine1, {
    x: titleCenterX - boldFont.widthOfTextAtSize(titleLine1, titleSize) / 2,
    y: 736,
    size: titleSize,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });
  page.drawText(titleLine2, {
    x: titleCenterX - boldFont.widthOfTextAtSize(titleLine2, titleSize) / 2,
    y: 726,
    size: titleSize,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });
 
  const fuecCodeText = `No. ${params.consecutivo}`;
  const fuecCodeBoxWidth = 220;
  const fuecCodeBoxHeight = 24;
  const fuecCodeBoxX = 559 - fuecCodeBoxWidth;
  const fuecCodeBoxY = 692;

  page.drawRectangle({
    x: fuecCodeBoxX,
    y: fuecCodeBoxY,
    width: fuecCodeBoxWidth,
    height: fuecCodeBoxHeight,
    color: rgb(0.91, 0.68, 0.17)
  });

  page.drawText(fuecCodeText, {
    x: fuecCodeBoxX + (fuecCodeBoxWidth - boldFont.widthOfTextAtSize(fuecCodeText, 9.4)) / 2,
    y: fuecCodeBoxY + 8,
    size: 9.4,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });

  drawCell({
    page,
    x: 36,
    y: 660,
    width: 360,
    height: 32,
    label: "RAZON SOCIAL",
    value: fitText(params.razonSocial, 55),
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 396,
    y: 660,
    width: 163,
    height: 32,
    label: "NIT",
    value: params.nit,
    labelFont: regularFont,
    valueFont: boldFont
  });

  drawCell({
    page,
    x: 36,
    y: 624,
    width: 523,
    height: 28,
    label: "CONTRATO No",
    value: params.contratoNo,
    labelFont: regularFont,
    valueFont: boldFont
  });

  drawCell({
    page,
    x: 36,
    y: 588,
    width: 360,
    height: 32,
    label: "CONTRATANTE",
    value: fitText(params.contrato.nombreSuscritoContrato, 44),
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 396,
    y: 588,
    width: 163,
    height: 32,
    label: "NIT/CC",
    value: params.contrato.documentoContratante,
    labelFont: regularFont,
    valueFont: boldFont
  });

  const objetoContrato =
    "EL CONTRATISTA se obliga a prestar el servicio público de transporte terrestre automotor especial de pasajeros, movilizando grupos determinables de usuarios designados por EL CONTRATANTE, en uno o varios vehículos habilitados, desde uno o varios puntos de origen hacia uno o varios destinos, en las fechas y horarios definidos, incluyendo el transporte de sus pertenencias, conforme a las condiciones contractuales pactadas.";

  drawParagraphCell({
    page,
    x: 36,
    y: 516,
    width: 523,
    height: 64,
    label: "OBJETO DEL CONTRATO",
    text: objetoContrato,
    labelFont: regularFont,
    valueFont: regularFont,
    maxCharsPerLine: 114,
    valueSize: 7.7,
    lineGap: 0.8
  });

  drawCell({
    page,
    x: 36,
    y: 478,
    width: 523,
    height: 30,
    label: "ORIGEN-DESTINO",
    value: fitText(params.contrato.detalleRecorrido, 95),
    labelFont: regularFont,
    valueFont: boldFont,
    valueSize: 8.8
  });

  drawCell({
    page,
    x: 36,
    y: 440,
    width: 523,
    height: 30,
    label: "LUGAR DE RECOGIDA",
    value: fitText(params.contrato.lugarRecogida, 95),
    labelFont: regularFont,
    valueFont: boldFont,
    valueSize: 8.8
  });

  page.drawRectangle({
    x: 36,
    y: 410,
    width: 523,
    height: 22,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1
  });
  page.drawText("VIGENCIA DEL CONTRATO", {
    x: 213,
    y: 417,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1)
  });

  drawCell({
    page,
    x: 36,
    y: 374,
    width: 261,
    height: 32,
    label: "FECHA INICIAL",
    value: params.fechaInicio,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 297,
    y: 374,
    width: 262,
    height: 32,
    label: "FECHA VENCIMIENTO",
    value: params.fechaFin,
    labelFont: regularFont,
    valueFont: boldFont
  });

  page.drawRectangle({
    x: 36,
    y: 344,
    width: 523,
    height: 22,
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 1
  });
  const vehicleDriverTitle = "CARACTERISTICA DEL VEHICULO Y DATOS DEL CONDUCTOR";
  page.drawText(vehicleDriverTitle, {
    x: 36 + (523 - boldFont.widthOfTextAtSize(vehicleDriverTitle, 10)) / 2,
    y: 351,
    size: 10,
    font: boldFont,
    color: rgb(0.1, 0.1, 0.1)
  });

  drawCell({
    page,
    x: 36,
    y: 308,
    width: 174,
    height: 32,
    label: "PLACA",
    value: params.placa,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 210,
    y: 308,
    width: 174,
    height: 32,
    label: "CLASE",
    value: params.tipoVehiculo,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 384,
    y: 308,
    width: 175,
    height: 32,
    label: "FECHA SERVICIO",
    value: params.fechaServicio,
    labelFont: regularFont,
    valueFont: boldFont
  });

  drawCell({
    page,
    x: 36,
    y: 272,
    width: 190,
    height: 32,
    label: "DATOS DEL CONDUCTOR",
    value: fitText(params.conductor, 26),
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 226,
    y: 272,
    width: 108,
    height: 32,
    label: "No. CEDULA",
    value: params.documento,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 334,
    y: 272,
    width: 125,
    height: 32,
    label: "No. LICENCIA",
    value: params.numeroLicencia,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 459,
    y: 272,
    width: 100,
    height: 32,
    label: "VIGENCIA",
    value: params.vigenciaLicencia,
    labelFont: regularFont,
    valueFont: boldFont
  });

  drawCell({
    page,
    x: 36,
    y: 218,
    width: 220,
    height: 46,
    label: "RESPONSABLE CONTRATANTE",
    value: fitText(params.contrato.nombreSuscritoContrato, 28),
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 256,
    y: 218,
    width: 110,
    height: 46,
    label: "No. CEDULA / NIT",
    value: params.contrato.documentoContratante,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 366,
    y: 218,
    width: 85,
    height: 46,
    label: "TELEFONO",
    value: params.contrato.telefono,
    labelFont: regularFont,
    valueFont: boldFont
  });
  drawCell({
    page,
    x: 451,
    y: 218,
    width: 108,
    height: 46,
    label: "DIRECCION",
    value: fitText(params.contrato.direccion, 18),
    labelFont: regularFont,
    valueFont: boldFont,
    valueSize: 8.4
  });

  drawCell({
    page,
    x: 36,
    y: 166,
    width: 523,
    height: 32,
    label: "CORREO / VALIDACION",
    value: fitText(
      `${params.contrato.correo} | ${buildValidationUrl(params.verificationCode)}`,
      95
    ),
    labelFont: regularFont,
    valueFont: regularFont,
    valueSize: 8.2
  });

  page.drawText(
    "Documento generado automaticamente. La emision del FUEC depende de un preoperacional valido del dia.",
    {
      x: 36,
      y: 54,
      size: 8.5,
      font: regularFont,
      color: rgb(0.28, 0.32, 0.34)
    }
  );

  return pdfDoc.save();
}

async function uploadFuecPdf(consecutivo: string, pdfBytes: Uint8Array<ArrayBufferLike>) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const path = `fuecs/${consecutivo}.pdf`;
  const pdfBuffer = pdfBytes.buffer.slice(
    pdfBytes.byteOffset,
    pdfBytes.byteOffset + pdfBytes.byteLength
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

export async function saveFuec(params: {
  placa: string;
  conductorDocumento: string;
  contratoReferencia: string;
  origen: string;
  destino: string;
  fechaServicio: string;
  observaciones: string;
}) {
  if (!supabase) {
    throw new Error("Supabase no esta configurado.");
  }

  const {
    placa,
    conductorDocumento,
    contratoReferencia,
    fechaServicio,
    observaciones
  } = params;

  const today = getBogotaDate();
  const { year } = getBogotaDateCodeParts();
  const contract = findContractByNumber(contratoReferencia);

  if (!contract) {
    throw new Error(`No se encontro el contrato ${contratoReferencia} en DATOS PARA CONTRATOS.`);
  }

  const [
    { data: vehicle, error: vehicleError },
    { data: driver, error: driverError },
    { data: authData, error: authError }
  ] = await Promise.all([
    supabase
      .from("vehiculos")
      .select("id, placa, tipo_vehiculo, estado")
      .eq("placa", placa)
      .single(),
    supabase
      .from("conductores")
      .select("id, documento, nombre_completo, estado, numero_licencia, vigencia_licencia")
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
  if (vehicle.estado !== "ACTIVO") {
    throw new Error("El vehiculo no esta activo y no puede emitir FUEC.");
  }
  if (driver.estado !== "ACTIVO") {
    throw new Error("El conductor no esta activo y no puede emitir FUEC.");
  }
  if (isExpiredDate(driver.vigencia_licencia)) {
    throw new Error("La licencia del conductor esta vencida y no permite emitir FUEC.");
  }

  const { data: inspection, error: inspectionError } = await supabase
    .from("inspecciones_preoperacionales")
    .select("id, codigo")
    .eq("vehiculo_id", vehicle.id)
    .eq("conductor_id", driver.id)
    .eq("fecha_operacion", today)
    .eq("cerrada", true)
    .in("resultado", ["APTO", "APTO_CON_OBSERVACION"])
    .maybeSingle();

  if (inspectionError) {
    throw inspectionError;
  }
  if (!inspection) {
    throw new Error(
      `No existe preoperacional habilitante para ${placa} y este conductor en la fecha ${today}.`
    );
  }

  const prefix = `208518525${year}${contract.numeroContrato}`;
  const { data: nextSequence, error: sequenceError } = await supabase.rpc(
    "generar_siguiente_numero_documento",
    {
      p_documento: "FUEC",
      p_anio: Number(year),
      p_prefijo: "GLOBAL"
    }
  );

  if (sequenceError) {
    throw sequenceError;
  }

  const consecutivoData = `${prefix}${String(nextSequence).padStart(4, "0")}`;
  const verificationCode = crypto.randomUUID().replaceAll("-", "");
  const fuecId = crypto.randomUUID();
  let emitterId: string | null = null;

  if (authData.user?.id) {
    const { data: appUser } = await supabase
      .from("usuarios")
      .select("id")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();
    emitterId = appUser?.id ?? null;
  }

  const { error: fuecError } = await supabase.from("fuecs").insert({
    id: fuecId,
    consecutivo: consecutivoData,
    vehiculo_id: vehicle.id,
    conductor_id: driver.id,
    inspeccion_id: inspection.id,
    contrato_referencia: contratoReferencia,
    origen: contract.lugarRecogida,
    destino: contract.detalleRecorrido,
    fecha_servicio: fechaServicio,
    observaciones: observaciones || null,
    codigo_verificacion: verificationCode,
    qr_url: buildValidationUrl(verificationCode),
    emitido_por: emitterId
  });

  if (fuecError) {
    throw fuecError;
  }

  const { error: documentError } = await supabase.from("documentos_verificables").insert({
    tipo: "FUEC",
    entidad_id: fuecId,
    codigo_verificacion: verificationCode,
    estado: "VIGENTE"
  });

  if (documentError) {
    throw documentError;
  }

  const companyLogo = await fetch("/fuec-logos/empresa.png").then((r) => r.arrayBuffer());
  const ministryLogo = await fetch("/fuec-logos/mintransporte.png").then((r) => r.arrayBuffer());
  const superLogo = await fetch("/fuec-logos/supertransporte.png").then((r) => r.arrayBuffer());

  const pdfBytes = await generateFuecPdf({
    consecutivo: consecutivoData,
    fechaEmision: today,
    logos: {
      empresa: new Uint8Array(companyLogo),
      ministerio: new Uint8Array(ministryLogo),
      supertransporte: new Uint8Array(superLogo)
    },
    placa: vehicle.placa,
    tipoVehiculo: vehicle.tipo_vehiculo,
    conductor: driver.nombre_completo,
    documento: driver.documento,
    numeroLicencia: driver.numero_licencia ?? "PENDIENTE",
    vigenciaLicencia: driver.vigencia_licencia ?? "PENDIENTE",
    contrato: contract,
    razonSocial: "ARENAS TOURS AGENCIA DE VIAJES Y TURISMOS S.A.S.",
    nit: "901.788.126-1",
    fechaInicio: contract.fechaInicioContrato,
    fechaFin: `${contract.diasContrato} dia(s) desde ${contract.fechaInicioContrato}`,
    contratoNo: contract.numeroContrato,
    fechaServicio,
    verificationCode
  });

  const pdfPath = await uploadFuecPdf(consecutivoData, pdfBytes);
  const pdfUrl = `documentos/${pdfPath}`;

  const { error: fuecUpdateError } = await supabase
    .from("fuecs")
    .update({ pdf_url: pdfUrl })
    .eq("id", fuecId);

  if (fuecUpdateError) {
    throw fuecUpdateError;
  }

  const { error: docUpdateError } = await supabase
    .from("documentos_verificables")
    .update({ pdf_url: pdfUrl })
    .eq("codigo_verificacion", verificationCode);

  if (docUpdateError) {
    throw docUpdateError;
  }

  return {
    consecutivo: consecutivoData,
    pdfUrl,
    verificationCode,
    inspectionCode: inspection.codigo
  };
}
