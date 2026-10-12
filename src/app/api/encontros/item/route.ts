import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { parseKey } from "@/features/encontros/domain";
import { getEventDay, getServiceDay } from "@/features/encontros/queries";

// Ficha de um encontro (culto num dia ou evento) para a semana trocar sem recarregar.
export async function GET(req: Request) {
  const k = parseKey(new URL(req.url).searchParams.get("key"));
  if (!k) return NextResponse.json({ error: "Encontro inválido." }, { status: 400 });
  const ctx = await requireOrg();
  const d = k.kind === "service" ? await getServiceDay(ctx.supabase, ctx.orgId, k.id, k.date) : await getEventDay(ctx.supabase, ctx.orgId, k.id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Encontro não encontrado." }, { status: 404 });
}
