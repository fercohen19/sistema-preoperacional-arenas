import { NextResponse } from "next/server";
import { syncCalendar } from "@/lib/server/calendar-sync";
import { getAdminClient, requireAdmin } from "@/lib/server/supabase-admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MIN_MINUTES_BETWEEN_AUTO_SYNCS = 10;

function icsUrl() {
  return process.env.GOOGLE_CALENDAR_ICS_URL?.trim() ?? "";
}

/** Ejecucion programada (Vercel Cron o Supabase pg_cron). Requiere CRON_SECRET. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret || provided !== secret) {
    return NextResponse.json({ ok: false, mensaje: "No autorizado." }, { status: 401 });
  }
  const client = getAdminClient();
  if (!client || !icsUrl()) {
    return NextResponse.json({ ok: false, mensaje: "Sincronizacion no configurada." }, { status: 500 });
  }
  const result = await syncCalendar(client, icsUrl(), "CRON");
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/** Ejecucion desde la agenda del administrador (boton o al abrir la pagina). */
export async function POST(request: Request) {
  const check = await requireAdmin(request);
  if (!check.ok) return NextResponse.json({ ok: false, mensaje: check.message }, { status: check.status });
  if (!icsUrl()) {
    return NextResponse.json(
      { ok: false, configurado: false, mensaje: "Falta configurar GOOGLE_CALENDAR_ICS_URL en Vercel." },
      { status: 400 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as { origen?: string };
  const origen = body.origen === "AUTOMATICA" ? "AUTOMATICA" : "MANUAL";

  if (origen === "AUTOMATICA") {
    const { data: last } = await check.client
      .from("calendario_sincronizaciones")
      .select("iniciado_at")
      .order("iniciado_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last?.iniciado_at && Date.now() - new Date(last.iniciado_at as string).getTime() < MIN_MINUTES_BETWEEN_AUTO_SYNCS * 60000) {
      return NextResponse.json({ ok: true, omitida: true, mensaje: "Sincronizada hace pocos minutos." });
    }
  }

  const result = await syncCalendar(check.client, icsUrl(), origen);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
