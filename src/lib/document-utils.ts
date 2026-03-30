import { appConfig } from "./config";

export function buildValidationUrl(code: string) {
  return `${appConfig.validationUrl}/${encodeURIComponent(code)}`;
}

export function buildPreoperationalCode(sequence: number, year = 2026) {
  return `PRE-${year}-${String(sequence).padStart(6, "0")}`;
}

export function buildFuecCode(sequence: number, year = 2026) {
  return `FUEC-${year}-${String(sequence).padStart(6, "0")}`;
}
