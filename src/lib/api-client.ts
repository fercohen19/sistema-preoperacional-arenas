"use client";

import { supabase } from "./supabase";

/** fetch a las rutas /api del propio sistema enviando la sesion del usuario. */
export async function authedFetch<T = Record<string, unknown>>(path: string, init: RequestInit = {}) {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {})
    }
  });
  const data = (await response.json().catch(() => ({}))) as T & { mensaje?: string; ok?: boolean };
  return { status: response.status, ok: response.ok, data };
}
