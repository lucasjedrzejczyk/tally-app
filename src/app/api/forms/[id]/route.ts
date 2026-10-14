import { NextResponse } from "next/server";
import { requireOrg, can } from "@/lib/auth/session";
import { getForm } from "@/features/forms/queries";

// Ficha de um formulário para a lista trocar sem recarregar (a RLS decide o acesso).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requireOrg();
  if (!can(ctx, "forms.manage")) return NextResponse.json({ error: "Sem acesso." }, { status: 403 });
  const d = await getForm(ctx.supabase, ctx.orgId, id);
  return d ? NextResponse.json(d) : NextResponse.json({ error: "Formulário não encontrado." }, { status: 404 });
}
