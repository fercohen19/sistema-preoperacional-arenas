import type { Role } from "./types";

export function resolveRoleHome(role: Role) {
  return role === "administrador" ? "/admin" : "/conductor";
}

export function resolveRoleLabel(role: Role) {
  return role === "administrador" ? "Administrador" : "Conductor";
}
