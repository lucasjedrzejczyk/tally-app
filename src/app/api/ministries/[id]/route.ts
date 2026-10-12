import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { getMinistry } from "@/features/ministries/queries";

// Ficha do ministério em JSON para a lista trocar de ministério sem recarregar (GET, fora da fila de Actions).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const detail = await getMinistry(ctx.supabase, ctx.orgId, id);
  return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Ministério não encontrado." }, { status: 404 });
}
