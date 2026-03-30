import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

export async function GET() {
  return NextResponse.json({
    ok: true,
    app: "sistema-preoperacional-arenas",
    supabaseConfigured: isSupabaseConfigured(),
    timestamp: new Date().toISOString()
  });
}
