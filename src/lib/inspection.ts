import { checklistItems, requiredEvidence } from "./checklist";
import type { EvidenceType, EvidenceUploadState, InspectionResult } from "./types";

export function evaluateInspectionResult(
  itemValues: Record<string, string>
): InspectionResult {
  const hasCriticalFailure = checklistItems.some((item) => {
    if (!item.critico) {
      return false;
    }

    const value = (itemValues[item.codigo] ?? "").trim().toUpperCase();
    return value === "MALO" || value === "NO" || value === "NO CUMPLE";
  });

  if (hasCriticalFailure) {
    return "NO_APTO";
  }

  const hasRegular = Object.values(itemValues).some(
    (value) => value.trim().toUpperCase() === "REGULAR"
  );

  if (hasRegular) {
    return "APTO_CON_OBSERVACION";
  }

  return "APTO";
}

export function missingRequiredEvidence(
  evidence: Partial<Record<EvidenceType, EvidenceUploadState>>
) {
  return requiredEvidence
    .filter((item) => item.obligatorio && !evidence[item.codigo]?.fileName)
    .map((item) => item.codigo);
}
