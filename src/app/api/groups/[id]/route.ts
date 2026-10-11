import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { getCell } from "@/features/groups/queries";

// Ficha da célula em JSON para a lista trocar de célula sem recarregar a página (leitura por GET,
// não por Server Action: ações entram numa fila e a leitura ficava presa atrás de uma gravação).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  const detail = await getCell(ctx.supabase, ctx.orgId, id);
  return detail ? NextResponse.json(detail) : NextResponse.json({ error: "Célula não encontrada." }, { status: 404 });
}
