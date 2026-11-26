import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con clave service_role. SOLO se usa en rutas de servidor (/api).
// La clave nunca debe llevar el prefijo NEXT_PUBLIC_.
let cached: SupabaseClient | null = null;

export function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return cached;
}

export type AdminCheck =
  | { ok: true; client: SupabaseClient; usuarioId: string }
  | { ok: false; status: number; message: string };

/** Verifica que la solicitud venga de un administrador con sesion activa. */
export async function requireAdmin(request: Request): Promise<AdminCheck> {
  const client = getAdminClient();
  if (!client) {
    return { ok: false, status: 500, message: "Falta configurar SUPABASE_SERVICE_ROLE_KEY en el servidor." };
  }
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return { ok: false, status: 401, message: "Sesion requerida." };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, message: "Sesion invalida o vencida." };

  const { data: usuario } = await client
    .from("usuarios")
    .select("id, rol, activo")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();

  if (!usuario || usuario.rol !== "administrador" || usuario.activo === false) {
    return { ok: false, status: 403, message: "Solo administradores pueden realizar esta accion." };
  }
  return { ok: true, client, usuarioId: usuario.id as string };
}
