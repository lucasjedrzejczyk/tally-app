import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { isIso } from "@/features/groups/domain";
import { getConflicts } from "@/features/ministries/queries";

// Quem deste dia já está escalado em outro ministério (?date=aaaa-mm-dd). GET para não esperar atrás das gravações.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const date = new URL(req.url).searchParams.get("date") ?? "";
  if (!isIso(date)) return NextResponse.json({ error: "Data inválida." }, { status: 400 });
  const ctx = await requireOrg();
  return NextResponse.json(await getConflicts(ctx.supabase, ctx.orgId, id, date));
}
