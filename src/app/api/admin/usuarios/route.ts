import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body = {
  accion?: "crear" | "activar" | "desactivar" | "cambiar_clave";
  documento?: string;
  nombre_completo?: string;
  email?: string;
  password?: string;
  celular?: string;
  rol?: "conductor" | "administrador";
};

const fail = (mensaje: string, status = 400) => NextResponse.json({ ok: false, mensaje }, { status });

/**
 * Accesos al sistema (Supabase Auth) para conductores y administradores.
 * Solo administradores. Usa la clave service_role en el servidor.
 */
export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return fail(check.message, check.status);
  const { client } = check;
  const body = (await request.json().catch(() => ({}))) as Body;
  const documento = (body.documento ?? "").trim();
  if (!documento) return fail("Falta el documento.");

  const { data: usuario } = await client
    .from("usuarios")
    .select("id, auth_user_id, rol, activo, email")
    .eq("documento", documento)
    .maybeSingle();

  if (body.accion === "crear") {
    const email = (body.email ?? "").trim().toLowerCase();
    const password = body.password ?? "";
    const rol = body.rol === "administrador" ? "administrador" : "conductor";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail("Correo no valido.");
    if (password.length < 8) return fail("La contrasena debe tener al menos 8 caracteres.");
    if (usuario?.auth_user_id) return fail("Esta persona ya tiene acceso. Usa 'Cambiar contrasena'.");

    const created = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { documento, nombre_completo: body.nombre_completo ?? "" }
    });
    if (created.error || !created.data.user) {
      const message = created.error?.message ?? "No fue posible crear el acceso.";
      return fail(/already been registered|already exists/i.test(message) ? "Ese correo ya esta registrado." : message);
    }

    const row = {
      auth_user_id: created.data.user.id,
      rol,
      documento,
      nombre_completo: (body.nombre_completo ?? "").trim() || documento,
      email,
      celular: body.celular?.trim() || null,
      activo: true,
      updated_at: new Date().toISOString()
    };
    const saved = usuario
      ? await client.from("usuarios").update(row).eq("id", usuario.id).select("id").single()
      : await client.from("usuarios").insert(row).select("id").single();
    if (saved.error) {
      await client.auth.admin.deleteUser(created.data.user.id);
      return fail(saved.error.message);
    }
    if (rol === "conductor") {
      await client.from("conductores").update({ usuario_id: saved.data.id }).eq("documento", documento);
    }
    return NextResponse.json({ ok: true, mensaje: `Acceso creado para ${email}.` });
  }

  if (!usuario?.auth_user_id) return fail("Esta persona todavia no tiene acceso al sistema.");

  if (body.accion === "cambiar_clave") {
    if ((body.password ?? "").length < 8) return fail("La contrasena debe tener al menos 8 caracteres.");
    const { error } = await client.auth.admin.updateUserById(usuario.auth_user_id as string, { password: body.password });
    if (error) return fail(error.message);
    return NextResponse.json({ ok: true, mensaje: "Contrasena actualizada." });
  }

  if (body.accion === "desactivar" || body.accion === "activar") {
    const activo = body.accion === "activar";
    const { error } = await client.auth.admin.updateUserById(usuario.auth_user_id as string, {
      ban_duration: activo ? "none" : "876000h"
    });
    if (error) return fail(error.message);
    await client.from("usuarios").update({ activo, updated_at: new Date().toISOString() }).eq("id", usuario.id);
    return NextResponse.json({ ok: true, mensaje: activo ? "Acceso reactivado." : "Acceso bloqueado." });
  }

  return fail("Accion no valida.");
}
