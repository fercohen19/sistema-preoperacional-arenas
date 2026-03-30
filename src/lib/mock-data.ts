import type { DriverSummary, InspectionResult, Role, VehicleSummary } from "./types";

export const mockVehicles: VehicleSummary[] = [
  {
    placa: "EQY341",
    tipoVehiculo: "Camioneta",
    propietarioAfiliado: "ARENAS TRANSPORTE"
  },
  {
    placa: "WMW324",
    tipoVehiculo: "Microbus",
    propietarioAfiliado: "ARENAS TRANSPORTE"
  },
  {
    placa: "LZR615",
    tipoVehiculo: "Microbus",
    propietarioAfiliado: "ROSARIO ARENAS DE PARRA"
  }
];

export const mockDrivers: DriverSummary[] = [
  {
    documento: "1140841512",
    nombreCompleto: "WILLIAMS PARRA ARENAS"
  },
  {
    documento: "78690566",
    nombreCompleto: "ELEAZAR MUÑOZ CASTRO"
  }
];

export const mockRecentInspections: Array<{
  codigo: string;
  fecha: string;
  placa: string;
  conductor: string;
  resultado: InspectionResult;
}> = [
  {
    codigo: "PRE-2026-000001",
    fecha: "2026-03-29 04:40",
    placa: "EQY341",
    conductor: "WILLIAMS PARRA ARENAS",
    resultado: "APTO"
  },
  {
    codigo: "PRE-2026-000002",
    fecha: "2026-03-29 06:31",
    placa: "WMW324",
    conductor: "ELEAZAR MUÑOZ CASTRO",
    resultado: "APTO_CON_OBSERVACION"
  }
];

export const mockCurrentUser: {
  nombre: string;
  rol: Role;
} = {
  nombre: "WILLIAMS PARRA ARENAS",
  rol: "conductor"
};

export const mockFuec = {
  consecutivo: "FUEC-2026-000001",
  estado: "HABILITADO",
  placa: "EQY341",
  conductor: "WILLIAMS PARRA ARENAS",
  contratoReferencia: "CT-0281-2026",
  ruta: "Cartagena - Barranquilla"
};
