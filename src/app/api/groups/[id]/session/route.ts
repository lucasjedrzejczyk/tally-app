import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { isIso } from "@/features/groups/domain";
import { getDaySession } from "@/features/groups/queries";

// Encontro de um dia da célula (?date=aaaa-mm-dd): o Marcar presença abre já com as marcações dele.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isIso(date)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const ctx = await requireOrg();
  return NextResponse.json(await getDaySession(ctx.supabase, ctx.orgId, id, date));
}
