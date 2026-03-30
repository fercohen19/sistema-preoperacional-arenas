import checklistData from "@/data/checklist_preoperacional.json";
import evidenciasData from "@/data/evidencias_obligatorias.json";
import type { ChecklistItem, EvidenceType } from "./types";

export const checklistItems = checklistData as ChecklistItem[];

export const requiredEvidence = evidenciasData as Array<{
  codigo: EvidenceType;
  nombre: string;
  obligatorio: boolean;
}>;
