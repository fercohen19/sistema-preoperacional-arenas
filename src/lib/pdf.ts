import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import { checklistItems } from "./checklist";
import { buildValidationUrl } from "./document-utils";
import type {
  DriverSummary,
  EvidenceType,
  EvidenceUploadState,
  InspectionResult,
  VehicleSummary
} from "./types";

async function fetchAsBytes(path: string) {
  const response = await fetch(path);
  const arrayBuffer = await response.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

async function evidenceToBytes(evidence: EvidenceUploadState) {
  if (evidence.file) {
    const arrayBuffer = await evidence.file.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  if (evidence.dataUrl) {
    const response = await fetch(evidence.dataUrl);
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  }

  return null;
}

function truncate(text: string, max = 85) {
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function drawFrame(page: PDFPage) {
  page.drawRectangle({
    x: 24,
    y: 24,
    width: 547,
    height: 794,
    borderColor: rgb(0.84, 0.86, 0.88),
    borderWidth: 1
  });
}

function drawHeader(page: PDFPage, logoImage: any, boldFont: PDFFont, regularFont: PDFFont, code: string) {
  const brandDark = rgb(0.17, 0.15, 0.13);
  const brandBrown = rgb(0.48, 0.38, 0.19);
  const brandGold = rgb(0.91, 0.68, 0.17);
  const lineColor = rgb(0.86, 0.87, 0.88);

  page.drawImage(logoImage, {
    x: 28,
    y: 744,
    width: 92,
    height: 66
  });

  const title = "INSPECCION PREOPERACIONAL";
  const titleSize = 16;
  const titleWidth = boldFont.widthOfTextAtSize(title, titleSize);
  const titleX = 24 + (547 - titleWidth) / 2;

  page.drawText(title, {
    x: titleX,
    y: 780,
    size: titleSize,
    font: boldFont,
    color: brandDark
  });

  const company = "Arenas Transporte y Turismo";
  const companySize = 11;
  const companyWidth = regularFont.widthOfTextAtSize(company, companySize);
  const companyX = 24 + (547 - companyWidth) / 2;

  page.drawText(company, {
    x: companyX,
    y: 756,
    size: 11,
    font: regularFont,
    color: brandBrown
  });

  page.drawRectangle({
    x: 420,
    y: 736,
    width: 130,
    height: 28,
    color: brandGold
  });

  const codeSize = 10;
  const codeWidth = boldFont.widthOfTextAtSize(code, codeSize);
  const codeX = 420 + (130 - codeWidth) / 2;
  page.drawText(code, {
    x: codeX,
    y: 746,
    size: codeSize,
    font: boldFont,
    color: brandDark
  });

  page.drawLine({
    start: { x: 24, y: 728 },
    end: { x: 571, y: 728 },
    thickness: 1,
    color: lineColor
  });
}

function drawInfoCard(params: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  labelFont: PDFFont;
  valueFont: PDFFont;
}) {
  const { page, x, y, width, height, label, value, labelFont, valueFont } = params;
  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.86, 0.87, 0.88),
    borderWidth: 1
  });
  page.drawText(label.toUpperCase(), {
    x: x + 12,
    y: y + height - 18,
    size: 8.5,
    font: labelFont,
    color: rgb(0.48, 0.38, 0.19)
  });
  page.drawText(truncate(value, 32), {
    x: x + 12,
    y: y + 14,
    size: 10.5,
    font: valueFont,
    color: rgb(0.17, 0.15, 0.13)
  });
}

function drawLabelValue(params: {
  page: PDFPage;
  label: string;
  value: string;
  x: number;
  y: number;
  labelFont: PDFFont;
  valueFont: PDFFont;
}) {
  const { page, label, value, x, y, labelFont, valueFont } = params;
  page.drawText(label, {
    x,
    y,
    size: 10,
    font: labelFont,
    color: rgb(0.12, 0.16, 0.2)
  });
  page.drawText(value, {
    x,
    y: y - 14,
    size: 10,
    font: valueFont,
    color: rgb(0.24, 0.28, 0.32)
  });
}

function drawCheckbox(
  page: PDFPage,
  x: number,
  y: number,
  checked: boolean,
  label: string,
  font: PDFFont
) {
  page.drawRectangle({
    x,
    y,
    width: 10,
    height: 10,
    borderColor: rgb(0.45, 0.49, 0.52),
    borderWidth: 1
  });

  if (checked) {
    page.drawLine({
      start: { x: x + 2, y: y + 5 },
      end: { x: x + 4.5, y: y + 2 },
      thickness: 1.4,
      color: rgb(0.05, 0.34, 0.31)
    });
    page.drawLine({
      start: { x: x + 4.5, y: y + 2 },
      end: { x: x + 8, y: y + 8 },
      thickness: 1.4,
      color: rgb(0.05, 0.34, 0.31)
    });
  }

  page.drawText(label, {
    x: x + 16,
    y: y + 1,
    size: 8.4,
    font,
    color: rgb(0.2, 0.23, 0.26)
  });
}

async function drawEvidenceImage(params: {
  page: PDFPage;
  pdfDoc: PDFDocument;
  evidence?: EvidenceUploadState;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  font: PDFFont;
}) {
  const { page, pdfDoc, evidence, title, x, y, width, height, font } = params;

  page.drawText(title, {
    x,
    y: y + height + 8,
    size: 8,
    font
  });

  page.drawRectangle({
    x,
    y,
    width,
    height,
    borderColor: rgb(0.82, 0.84, 0.86),
    borderWidth: 1
  });

  if (!evidence) {
    page.drawText("Sin imagen", {
      x: x + 24,
      y: y + height / 2 - 4,
      size: 8,
      font
    });
    return;
  }

  const imageBytes = await evidenceToBytes(evidence);
  if (!imageBytes) {
    return;
  }

  const image = evidence.fileName.toLowerCase().endsWith(".png")
    ? await pdfDoc.embedPng(imageBytes)
    : await pdfDoc.embedJpg(imageBytes);

  page.drawImage(image, {
    x: x + 4,
    y: y + 4,
    width: width - 8,
    height: height - 8
  });
}

export async function generatePreoperationalPdf(params: {
  code: string;
  verificationCode: string;
  vehicle: VehicleSummary;
  driver: DriverSummary;
  kilometraje: number;
  observaciones: string;
  resultado: InspectionResult;
  itemValues: Record<string, string>;
  evidenceValues: Partial<Record<EvidenceType, EvidenceUploadState>>;
  fechaOperacion: string;
}) {
  const {
    code,
    verificationCode,
    driver,
    evidenceValues,
    fechaOperacion,
    itemValues,
    kilometraje,
    observaciones,
    resultado,
    vehicle
  } = params;

  const pdfDoc = await PDFDocument.create();
  const firstPage = pdfDoc.addPage([595, 842]);
  const secondPage = pdfDoc.addPage([595, 842]);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const logoBytes = await fetchAsBytes("/logo-arenas.png");
  const logoImage = await pdfDoc.embedPng(logoBytes);
  const verificationUrl = buildValidationUrl(verificationCode);

  drawFrame(firstPage);
  drawFrame(secondPage);
  drawHeader(firstPage, logoImage, boldFont, regularFont, code);
  drawHeader(secondPage, logoImage, boldFont, regularFont, code);

  let cursorY = 690;

  drawLabelValue({
    page: firstPage,
    label: "Fecha de operacion",
    value: fechaOperacion,
    x: 36,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });
  drawLabelValue({
    page: firstPage,
    label: "Placa",
    value: vehicle.placa,
    x: 190,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });
  drawLabelValue({
    page: firstPage,
    label: "Tipo de vehiculo",
    value: vehicle.tipoVehiculo,
    x: 300,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });
  drawLabelValue({
    page: firstPage,
    label: "Kilometraje",
    value: kilometraje.toString(),
    x: 450,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });

  cursorY -= 46;

  drawLabelValue({
    page: firstPage,
    label: "Conductor",
    value: driver.nombreCompleto,
    x: 36,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });
  drawLabelValue({
    page: firstPage,
    label: "Documento",
    value: driver.documento,
    x: 300,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });
  drawLabelValue({
    page: firstPage,
    label: "Resultado",
    value: resultado,
    x: 450,
    y: cursorY,
    labelFont: boldFont,
    valueFont: regularFont
  });

  cursorY -= 54;

  firstPage.drawText("Checklist diligenciado", {
    x: 36,
    y: cursorY,
    size: 12,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });

  cursorY -= 18;

  firstPage.drawRectangle({
    x: 36,
    y: cursorY - 4,
    width: 523,
    height: 18,
    color: rgb(0.98, 0.80, 0.53)
  });
  firstPage.drawText("Item", {
    x: 44,
    y: cursorY + 1,
    size: 9,
    font: boldFont
  });
  firstPage.drawText("Valor", {
    x: 420,
    y: cursorY + 1,
    size: 9,
    font: boldFont
  });

  cursorY -= 20;

  for (const item of checklistItems) {
    const value = itemValues[item.codigo] || "Sin dato";

    if (item.tipo === "enumlist") {
      firstPage.drawText(item.nombre, {
        x: 44,
        y: cursorY,
        size: 8.8,
        font: regularFont,
        color: rgb(0.2, 0.23, 0.26)
      });
      cursorY -= 16;

      const selectedValues = value.split(" | ").filter(Boolean);
      item.opciones?.forEach((option, index) => {
        const column = index % 2;
        const row = Math.floor(index / 2);
        drawCheckbox(
          firstPage,
          52 + column * 230,
          cursorY - row * 14,
          selectedValues.includes(option),
          option,
          regularFont
        );
      });
      cursorY -= Math.ceil((item.opciones?.length ?? 0) / 2) * 14 + 6;
    } else {
      firstPage.drawLine({
        start: { x: 36, y: cursorY - 4 },
        end: { x: 559, y: cursorY - 4 },
        thickness: 0.6,
        color: rgb(0.9, 0.9, 0.9)
      });
      firstPage.drawText(truncate(item.nombre, 60), {
        x: 44,
        y: cursorY,
        size: 8.8,
        font: regularFont,
        color: rgb(0.2, 0.23, 0.26)
      });
      firstPage.drawText(truncate(value, 20), {
        x: 420,
        y: cursorY,
        size: 8.8,
        font: boldFont,
        color: rgb(0.2, 0.23, 0.26)
      });
      cursorY -= 14;
    }
  }

  cursorY -= 10;

  firstPage.drawText("Observaciones", {
    x: 36,
    y: cursorY,
    size: 12,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });

  cursorY -= 20;

  const observationLines =
    observaciones.trim().length > 0
      ? observaciones.match(/.{1,95}(\s|$)/g) ?? [observaciones]
      : ["Sin observaciones registradas."];

  for (const line of observationLines.slice(0, 6)) {
    firstPage.drawText(line.trim(), {
      x: 44,
      y: cursorY,
      size: 9,
      font: regularFont,
      color: rgb(0.28, 0.32, 0.34)
    });
    cursorY -= 13;
  }

  secondPage.drawText("Evidencias fotograficas", {
    x: 36,
    y: 715,
    size: 12,
    font: boldFont,
    color: rgb(0.17, 0.15, 0.13)
  });

  await drawEvidenceImage({
    page: secondPage,
    pdfDoc,
    evidence: evidenceValues.FOTO_FRONTAL,
    title: "Foto frontal",
    x: 40,
    y: 560,
    width: 110,
    height: 120,
    font: boldFont
  });
  await drawEvidenceImage({
    page: secondPage,
    pdfDoc,
    evidence: evidenceValues.FOTO_TRASERA,
    title: "Foto trasera",
    x: 170,
    y: 560,
    width: 110,
    height: 120,
    font: boldFont
  });
  await drawEvidenceImage({
    page: secondPage,
    pdfDoc,
    evidence: evidenceValues.FOTO_TABLERO_KM,
    title: "Tablero KM",
    x: 300,
    y: 560,
    width: 110,
    height: 120,
    font: boldFont
  });
  await drawEvidenceImage({
    page: secondPage,
    pdfDoc,
    evidence: evidenceValues.FOTO_ELEMENTOS_SEGURIDAD,
    title: "Elementos de seguridad",
    x: 430,
    y: 560,
    width: 110,
    height: 120,
    font: boldFont
  });

  secondPage.drawText("Firma del conductor", {
    x: 40,
    y: 500,
    size: 10,
    font: boldFont
  });
  secondPage.drawRectangle({
    x: 40,
    y: 320,
    width: 240,
    height: 160,
    borderColor: rgb(0.82, 0.84, 0.86),
    borderWidth: 1
  });

  const signature = evidenceValues.FIRMA_CONDUCTOR;
  const signatureBytes = signature ? await evidenceToBytes(signature) : null;
  if (signatureBytes) {
    const signatureImage = await pdfDoc.embedPng(signatureBytes);
    secondPage.drawImage(signatureImage, {
      x: 48,
      y: 328,
      width: 224,
      height: 144
    });
  }

  secondPage.drawText("Verificacion", {
    x: 320,
    y: 500,
    size: 10,
    font: boldFont
  });
  secondPage.drawRectangle({
    x: 320,
    y: 320,
    width: 220,
    height: 160,
    borderColor: rgb(0.82, 0.84, 0.86),
    borderWidth: 1
  });
  secondPage.drawText(`Codigo: ${verificationCode}`, {
    x: 332,
    y: 450,
    size: 8.5,
    font: regularFont
  });
  secondPage.drawText("Validar en:", {
    x: 332,
    y: 428,
    size: 8.5,
    font: boldFont
  });
  secondPage.drawText(truncate(verificationUrl, 34), {
    x: 332,
    y: 412,
    size: 8.5,
    font: regularFont,
    color: rgb(0.1, 0.3, 0.45)
  });
  secondPage.drawText(
    "Documento generado automaticamente desde el sistema de preoperacional.",
    {
      x: 332,
      y: 382,
      size: 8.5,
      font: regularFont,
      color: rgb(0.28, 0.32, 0.34)
    }
  );

  return pdfDoc.save();
}
