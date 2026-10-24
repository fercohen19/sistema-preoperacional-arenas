import { PDFDocument, StandardFonts, rgb, type PDFImage, type PDFFont, type PDFPage } from "pdf-lib";

export type VehicleHistoryProfile = {
  placa: string;
  tipoVehiculo: string;
  capacidad?: number | null;
  propietario?: string | null;
  marca?: string | null;
  modeloAnio?: number | null;
  numeroInterno?: string | null;
  numeroPasajeros?: number | null;
  tipoCarroceria?: string | null;
  cilindraje?: string | null;
  linea?: string | null;
  numeroMotor?: string | null;
  numeroChasis?: string | null;
  identificacionPropietario?: string | null;
  emailPropietario?: string | null;
  celularPropietario?: string | null;
};

export type VehicleMaintenancePdfRecord = {
  fecha: string;
  tipo: "PREVENTIVO" | "CORRECTIVO";
  asunto: string;
  descripcion: string;
  lugar?: string | null;
  kilometrajeActual: number;
  proximaFecha?: string | null;
  proximoKilometraje?: number | null;
};

const pageWidth = 595.28;
const pageHeight = 841.89;
const margin = 32;
const black = rgb(0.1, 0.11, 0.12);
const gray = rgb(0.72, 0.72, 0.7);
const gold = rgb(0.89, 0.62, 0.1);

function display(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number) {
  const words = text.replace(/\s+/g, " ").trim().split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines.length ? lines : ["-"];
}

function drawTextLines(params: {
  page: PDFPage;
  lines: string[];
  x: number;
  y: number;
  font: PDFFont;
  size: number;
  lineHeight: number;
}) {
  const { page, lines, x, y, font, size, lineHeight } = params;
  lines.forEach((line, index) => {
    page.drawText(line, { x, y: y - index * lineHeight, size, font, color: black });
  });
}

function drawCell(params: {
  page: PDFPage;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: string;
  bold: PDFFont;
  regular: PDFFont;
}) {
  const { page, x, y, width, height, label, value, bold, regular } = params;
  page.drawRectangle({ x, y: y - height, width, height, borderColor: black, borderWidth: 0.6 });
  page.drawText(label, { x: x + 5, y: y - 13, size: 7.4, font: bold, color: black });
  drawTextLines({
    page,
    lines: wrapText(value, regular, 7.3, width - 10).slice(0, 2),
    x: x + 5,
    y: y - 25,
    font: regular,
    size: 7.3,
    lineHeight: 8.6
  });
}

async function loadLogo() {
  const response = await fetch("/logo-arenas.png");
  if (!response.ok) return null;
  return new Uint8Array(await response.arrayBuffer());
}

function drawHeader(params: {
  page: PDFPage;
  pageNumber: number;
  logo?: PDFImage | null;
  bold: PDFFont;
  regular: PDFFont;
}) {
  const { page, pageNumber, logo, bold, regular } = params;
  const top = pageHeight - margin;
  page.drawRectangle({ x: margin, y: top - 94, width: pageWidth - margin * 2, height: 94, borderColor: black, borderWidth: 1.3 });
  page.drawLine({ start: { x: 185, y: top }, end: { x: 185, y: top - 94 }, thickness: 1.1, color: black });

  if (logo) {
    const scaled = logo.scaleToFit(108, 52);
    page.drawImage(logo, {
      x: 54,
      y: top - 66,
      width: scaled.width,
      height: scaled.height
    });
  } else {
    page.drawText("arenas", { x: 61, y: top - 45, size: 37, font: bold, color: gold });
    page.drawText("TRANSPORTE - TOURS", { x: 55, y: top - 66, size: 9, font: regular, color: black });
  }
  page.drawText("HOJA DE VIDA VEHICULO", { x: 270, y: top - 35, size: 15, font: bold, color: black });
  page.drawText("AGENCIA DE VIAJES ARENAS TOURS Y TRANSPORTE", { x: 211, y: top - 53, size: 8.5, font: bold, color: black });
  page.drawText("NIT 901.788.126-1", { x: 300, y: top - 68, size: 8.5, font: bold, color: black });
  page.drawText(`Pagina ${pageNumber}`, { x: 494, y: top - 85, size: 7.5, font: regular, color: black });
}

function drawSectionBar(page: PDFPage, text: string, y: number, bold: PDFFont) {
  page.drawRectangle({ x: margin, y: y - 18, width: pageWidth - margin * 2, height: 18, color: gray, borderColor: black, borderWidth: 0.7 });
  const width = bold.widthOfTextAtSize(text, 9);
  page.drawText(text, { x: (pageWidth - width) / 2, y: y - 12.5, size: 9, font: bold, color: black });
}

export async function generateVehicleHistoryPdf(params: {
  vehicle: VehicleHistoryProfile;
  records: VehicleMaintenancePdfRecord[];
}) {
  const pdf = await PDFDocument.create();
  const [regular, bold] = await Promise.all([
    pdf.embedFont(StandardFonts.Helvetica),
    pdf.embedFont(StandardFonts.HelveticaBold)
  ]);
  const logoBytes = await loadLogo();
  const logo = logoBytes ? await pdf.embedPng(logoBytes).catch(() => null) : null;
  let pageNumber = 0;

  const addPage = () => {
    const page = pdf.addPage([pageWidth, pageHeight]);
    pageNumber += 1;
    drawHeader({ page, pageNumber, logo, bold, regular });
    return page;
  };

  let page = addPage();
  let cursorY = pageHeight - margin - 112;
  drawSectionBar(page, "INFORMACION GENERAL", cursorY, bold);
  cursorY -= 18;

  const profileCells = [
    ["Placa", display(params.vehicle.placa)],
    ["Marca", display(params.vehicle.marca)],
    ["No. interno", display(params.vehicle.numeroInterno)],
    ["Modelo", display(params.vehicle.modeloAnio)],
    ["Pasajeros", display(params.vehicle.numeroPasajeros ?? params.vehicle.capacidad)],
    ["Clase vehiculo", display(params.vehicle.tipoVehiculo)],
    ["Tipo carroceria", display(params.vehicle.tipoCarroceria)],
    ["Cilindraje", display(params.vehicle.cilindraje)],
    ["Linea", display(params.vehicle.linea)],
    ["No. motor", display(params.vehicle.numeroMotor)],
    ["No. chasis", display(params.vehicle.numeroChasis)],
    ["Propietario", display(params.vehicle.propietario)],
    ["Identificacion", display(params.vehicle.identificacionPropietario)],
    ["Correo", display(params.vehicle.emailPropietario)],
    ["Celular", display(params.vehicle.celularPropietario)]
  ];

  profileCells.forEach(([label, value], index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    drawCell({
      page,
      x: margin + column * ((pageWidth - margin * 2) / 3),
      y: cursorY - row * 38,
      width: (pageWidth - margin * 2) / 3,
      height: 38,
      label,
      value,
      bold,
      regular
    });
  });

  cursorY -= Math.ceil(profileCells.length / 3) * 38 + 16;
  drawSectionBar(page, "REGISTRO DE MANTENIMIENTOS", cursorY, bold);
  cursorY -= 18;

  const columns = [50, 72, 142, 70, 58, 55, 61];
  const labels = ["Fecha", "Asunto", "Descripcion", "Lugar", "KM actual", "F. proxima", "KM cambio"];
  const drawTableHeader = () => {
    let x = margin;
    labels.forEach((label, index) => {
      page.drawRectangle({ x, y: cursorY - 19, width: columns[index], height: 19, borderColor: black, borderWidth: 0.6 });
      const textWidth = bold.widthOfTextAtSize(label, 6.5);
      page.drawText(label, { x: x + (columns[index] - textWidth) / 2, y: cursorY - 12.5, size: 6.5, font: bold, color: black });
      x += columns[index];
    });
    cursorY -= 19;
  };

  drawTableHeader();
  const records = [...params.records].sort((a, b) => b.fecha.localeCompare(a.fecha));

  for (const record of records) {
    const values = [
      formatDate(record.fecha),
      record.tipo === "PREVENTIVO" ? "Mant. preventivo" : "Mant. correctivo",
      `${record.asunto}. ${record.descripcion}`,
      display(record.lugar),
      String(record.kilometrajeActual),
      formatDate(record.proximaFecha),
      display(record.proximoKilometraje)
    ];
    const lines = values.map((value, index) => wrapText(value, regular, 6.4, columns[index] - 8));
    const rowHeight = Math.max(29, ...lines.map((line) => line.length * 8 + 8));

    if (cursorY - rowHeight < margin + 18) {
      page = addPage();
      cursorY = pageHeight - margin - 112;
      drawSectionBar(page, "REGISTRO DE MANTENIMIENTOS (CONTINUACION)", cursorY, bold);
      cursorY -= 18;
      drawTableHeader();
    }

    let x = margin;
    lines.forEach((cellLines, index) => {
      page.drawRectangle({ x, y: cursorY - rowHeight, width: columns[index], height: rowHeight, borderColor: black, borderWidth: 0.5 });
      drawTextLines({ page, lines: cellLines, x: x + 4, y: cursorY - 10, font: regular, size: 6.4, lineHeight: 8 });
      x += columns[index];
    });
    cursorY -= rowHeight;
  }

  if (records.length === 0) {
    page.drawText("Aun no hay mantenimientos registrados para este vehiculo.", { x: margin + 8, y: cursorY - 22, size: 8, font: regular, color: black });
  }

  return pdf.save();
}
