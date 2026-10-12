import { NextResponse } from "next/server";
import { requireOrg } from "@/lib/auth/session";
import { findSermons } from "@/features/encontros/queries";

// Busca de sermões para ligar ao culto.
export async function GET(req: Request) {
  const ctx = await requireOrg();
  return NextResponse.json(await findSermons(ctx.supabase, ctx.orgId, new URL(req.url).searchParams.get("q") ?? ""));
}
