// Lectura de la hoja de costos que la empresa lleva por aparte (Excel o Google Sheets
// descargado como .xlsx/.csv). Reconoce dos tipos de informacion en la misma hoja:
//  * Servicios: Descripcion, Valor, Costo de conductor + Aux. Transporte, Peajes (y Fecha si existe)
//  * Tanqueos:  Fecha de Tanqueo, Costo de ACPM (o columnas Fecha, Categoria, Descripcion, Valor, Placa)

export type ImportedService = {
  fila: number;
  fecha: string | null;
  titulo: string;
  valor: number;
  costoConductor: number;
  peajesCantidad: number;
  peajesDetalle: string;
  placa: string;
};

export type ImportedExpense = {
  fila: number;
  fecha: string;
  hora: string | null;
  categoria: string;
  descripcion: string;
  valor: number;
  placa: string;
};

export const EXPENSE_CATEGORIES: Record<string, string> = {
  COMBUSTIBLE: "Combustible",
  PEAJES: "Peajes",
  CONDUCTOR: "Conductores",
  MANTENIMIENTO: "Mantenimiento",
  PARQUEADERO: "Parqueadero",
  LAVADO: "Lavado",
  SEGUROS_DOCUMENTOS: "Seguros y documentos",
  IMPUESTOS: "Impuestos",
  ADMINISTRATIVO: "Administrativo",
  OTRO: "Otro"
};

const norm = (value: unknown) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export function toMoney(value: unknown) {
  if (typeof value === "number") return Math.round(value);
  const text = String(value ?? "").trim();
  if (!text) return 0;
  // "$1.220.000", "1,220,000.50", "470000"
  const cleaned = text.replace(/[^\d.,-]/g, "");
  const lastSep = Math.max(cleaned.lastIndexOf(","), cleaned.lastIndexOf("."));
  const decimals = lastSep >= 0 ? cleaned.length - lastSep - 1 : 0;
  const integerPart = decimals > 0 && decimals <= 2 ? cleaned.slice(0, lastSep) : cleaned;
  return Number(integerPart.replace(/[.,]/g, "")) || 0;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** Devuelve { fecha: YYYY-MM-DD, hora: HH:MM | null } de un Date, numero de Excel o texto. */
export function toDateParts(value: unknown): { fecha: string; hora: string | null } | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const hasTime = value.getHours() + value.getMinutes() > 0;
    return {
      fecha: `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`,
      hora: hasTime ? `${pad(value.getHours())}:${pad(value.getMinutes())}` : null
    };
  }
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const ms = Math.round((value - 25569) * 86400000);
    const date = new Date(ms);
    const hasTime = date.getUTCHours() + date.getUTCMinutes() > 0;
    return {
      fecha: `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
      hora: hasTime ? `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}` : null
    };
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (match) {
    return { fecha: `${match[1]}-${pad(+match[2])}-${pad(+match[3])}`, hora: match[4] ? `${pad(+match[4])}:${match[5]}` : null };
  }
  match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    return { fecha: `${year}-${pad(+match[2])}-${pad(+match[1])}`, hora: match[4] ? `${pad(+match[4])}:${match[5]}` : null };
  }
  return null;
}

function findColumn(headers: string[], ...patterns: RegExp[]) {
  for (const pattern of patterns) {
    const index = headers.findIndex((header) => pattern.test(header));
    if (index >= 0) return index;
  }
  return -1;
}

function guessCategory(text: string) {
  const value = norm(text);
  if (/acpm|gasolina|diesel|combustible|tanqueo/.test(value)) return "COMBUSTIBLE";
  if (/peaje/.test(value)) return "PEAJES";
  if (/lavad/.test(value)) return "LAVADO";
  if (/parqueadero|parking/.test(value)) return "PARQUEADERO";
  if (/soat|seguro|tecnomecanica|revision|poliza/.test(value)) return "SEGUROS_DOCUMENTOS";
  if (/mantenimiento|aceite|llanta|repuesto|taller/.test(value)) return "MANTENIMIENTO";
  if (/conductor|nomina|aux/.test(value)) return "CONDUCTOR";
  if (/impuesto|dian|ica/.test(value)) return "IMPUESTOS";
  const upper = text.toUpperCase().replace(/\s+/g, "_");
  return upper in EXPENSE_CATEGORIES ? upper : "OTRO";
}

/** rows: matriz de la hoja (primera fila con encabezados). */
export function parseCostSheet(rows: unknown[][]) {
  const headerIndex = rows.findIndex((row) => row.filter((cell) => String(cell ?? "").trim()).length >= 2);
  if (headerIndex < 0) return { services: [], expenses: [], warnings: ["La hoja esta vacia."] };
  const headers = rows[headerIndex].map(norm);

  const col = {
    descripcion: findColumn(headers, /^descripcion$/, /^servicio$/, /descripcion/, /detalle/),
    valor: findColumn(headers, /^valor$/, /valor del servicio/, /^tarifa$/, /^precio$/),
    conductor: findColumn(headers, /costo de conductor/, /conductor.*aux/, /pago conductor/),
    peajes: findColumn(headers, /^peajes?$/),
    fechaServicio: findColumn(headers, /^fecha$/, /fecha servicio/, /fecha del servicio/),
    placa: findColumn(headers, /^placa$/, /vehiculo/),
    fechaTanqueo: findColumn(headers, /fecha de tanqueo/, /fecha tanqueo/),
    costoAcpm: findColumn(headers, /costo de acpm/, /acpm/, /combustible/),
    categoria: findColumn(headers, /^categoria$/),
    gastoValor: findColumn(headers, /^valor gasto$/, /^gasto$/)
  };

  const services: ImportedService[] = [];
  const expenses: ImportedExpense[] = [];
  const warnings: string[] = [];
  const isExpenseSheet = col.categoria >= 0; // plantilla de gastos del sistema

  rows.slice(headerIndex + 1).forEach((row, offset) => {
    const fila = headerIndex + offset + 2;
    const cell = (index: number) => (index >= 0 ? row[index] : undefined);

    if (isExpenseSheet) {
      const parts = toDateParts(cell(col.fechaServicio));
      const valor = toMoney(cell(col.valor));
      if (!parts && !valor) return;
      if (!parts || !valor) {
        warnings.push(`Fila ${fila}: falta fecha o valor, no se importa.`);
        return;
      }
      const descripcion = String(cell(col.descripcion) ?? "").trim() || "Gasto";
      expenses.push({
        fila,
        fecha: parts.fecha,
        hora: parts.hora,
        categoria: guessCategory(String(cell(col.categoria) ?? descripcion)),
        descripcion: descripcion.slice(0, 250),
        valor,
        placa: String(cell(col.placa) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      });
      return;
    }

    // Bloque de servicios
    const titulo = String(cell(col.descripcion) ?? "").trim();
    const valor = toMoney(cell(col.valor));
    if (titulo && valor) {
      const peajesText = String(cell(col.peajes) ?? "").trim();
      const peajesCantidad = Number(peajesText.match(/\d+/)?.[0] ?? (peajesText ? 1 : 0));
      services.push({
        fila,
        fecha: toDateParts(cell(col.fechaServicio))?.fecha ?? null,
        titulo: titulo.slice(0, 200),
        valor,
        costoConductor: toMoney(cell(col.conductor)),
        peajesCantidad,
        peajesDetalle: peajesText,
        placa: String(cell(col.placa) ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "")
      });
    }

    // Bloque de tanqueos en la misma fila (columnas independientes)
    const tanqueo = toDateParts(cell(col.fechaTanqueo));
    const acpm = toMoney(cell(col.costoAcpm));
    if (acpm && col.costoAcpm >= 0) {
      if (!tanqueo) {
        warnings.push(`Fila ${fila}: tanqueo de ${acpm} sin fecha; se importa con la fecha por defecto.`);
      }
      expenses.push({
        fila,
        fecha: tanqueo?.fecha ?? "",
        hora: tanqueo?.hora ?? null,
        categoria: "COMBUSTIBLE",
        descripcion: "Tanqueo ACPM",
        valor: acpm,
        placa: ""
      });
    }
  });

  return { services, expenses, warnings };
}
