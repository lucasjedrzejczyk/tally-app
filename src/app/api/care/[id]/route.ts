import { NextResponse } from "next/server";
import { requireOrg, can } from "@/lib/auth/session";
import { getCare } from "@/features/care/queries";

// Ficha de um acompanhamento para a lista trocar sem recarregar (a RLS decide o sigilo).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  if (!can(ctx, "care.view")) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  const d = await getCare(ctx.supabase, ctx.orgId, id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Acompanhamento não encontrado." }, { status: 404 });
}
