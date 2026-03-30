export type Role = "administrador" | "conductor";

export type InspectionResult = "APTO" | "APTO_CON_OBSERVACION" | "NO_APTO";

export type EvidenceType =
  | "FOTO_FRONTAL"
  | "FOTO_TRASERA"
  | "FOTO_TABLERO_KM"
  | "FOTO_ELEMENTOS_SEGURIDAD"
  | "FIRMA_CONDUCTOR";

export interface ChecklistItem {
  codigo: string;
  nombre: string;
  tipo: "estado" | "texto_corto" | "texto_largo" | "enumlist";
  opciones?: string[];
  critico: boolean;
  obligatorio: boolean;
}

export interface VehicleSummary {
  placa: string;
  tipoVehiculo: string;
  propietarioAfiliado: string;
}

export interface DriverSummary {
  documento: string;
  nombreCompleto: string;
}

export interface InspectionDraft {
  placa: string;
  conductorDocumento: string;
  kilometraje: string;
  observaciones: string;
}

export interface EvidenceUploadState {
  fileName: string;
  file?: File;
  dataUrl?: string;
}
