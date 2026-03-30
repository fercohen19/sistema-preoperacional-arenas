import contractsData from "@/data/contratos.json";

type RawContract = Record<string, string | number>;

function normalizeText(value: string) {
  try {
    return decodeURIComponent(escape(value)).replaceAll("Â", "").trim();
  } catch {
    return value.replaceAll("Â", "").trim();
  }
}

function stringValue(raw: RawContract, keys: string[]) {
  for (const key of keys) {
    if (key in raw) {
      return normalizeText(String(raw[key] ?? ""));
    }
  }

  return "";
}

export interface ContractRecord {
  numeroContrato: string;
  nombreSuscritoContrato: string;
  documentoContratante: string;
  correo: string;
  telefono: string;
  direccion: string;
  detalleRecorrido: string;
  personasTransportadas: string;
  vehiculoAsignado: string;
  conductorAsignado: string;
  documentoConductor: string;
  diasContrato: string;
  fechaInicioContrato: string;
  lugarRecogida: string;
  valorContrato: string;
}

export const contractRecords: ContractRecord[] = (contractsData as RawContract[]).map(
  (raw) => ({
    numeroContrato: stringValue(raw, ["Numero contrato"]).padStart(4, "0"),
    nombreSuscritoContrato: stringValue(raw, ["Nombre suscrito contrato"]),
    documentoContratante: stringValue(raw, ["No. Documento"]),
    correo: stringValue(raw, ["Correo"]),
    telefono: stringValue(raw, ["Teléfono", "TelÃ©fono"]),
    direccion: stringValue(raw, ["Dirección", "DirecciÃ³n"]),
    detalleRecorrido: stringValue(raw, ["Detalle recorrido"]),
    personasTransportadas: stringValue(raw, ["Personas que se transportaran"]),
    vehiculoAsignado: stringValue(raw, ["Vehiculo asignado"]),
    conductorAsignado: stringValue(raw, ["Conductor asignado"]),
    documentoConductor: stringValue(raw, ["Documento conductor"]),
    diasContrato: stringValue(raw, ["Días de contrato", "DÃ­as de contrato"]),
    fechaInicioContrato: stringValue(raw, ["Fecha de inicio contrato"]),
    lugarRecogida: stringValue(raw, ["Lugar de recogida"]),
    valorContrato: stringValue(raw, ["Valor del contrato"])
  })
);

export function findContractByNumber(contractNumber: string) {
  const normalized = contractNumber.trim().padStart(4, "0");
  return contractRecords.find((contract) => contract.numeroContrato === normalized) ?? null;
}
