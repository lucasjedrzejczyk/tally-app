import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { isIso } from "@/features/groups/domain";
import { weekStart } from "@/features/encontros/domain";
import { weekData } from "@/features/encontros/queries";

// Eventos e dias mexidos de uma semana (GET, fora da fila de Actions).
export async function GET(req: Request) {
  const start = new URL(req.url).searchParams.get("start") ?? "";
  if (!isIso(start)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const ctx = await requireOrg();
  return NextResponse.json(await weekData(ctx.supabase, ctx.orgId, weekStart(start)));
}
