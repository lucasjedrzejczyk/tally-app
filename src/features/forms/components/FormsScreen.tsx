// Tela de Formulários no servidor: lista e a ficha escolhida (?f=<id>). Só quem tem forms.manage.
import { redirect } from "next/navigation";
import { requireStaff, can } from "@/lib/auth/session";
import { canEditPeople } from "@/features/sticks/access";
import { getForm, listForms } from "../queries";
import { FormsView } from "./FormsView";

export async function FormsScreen({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const ctx = await requireStaff();
  if (!can(ctx, "forms.manage")) redirect("/study/bible");
  const forms = await listForms(ctx.supabase, ctx.orgId);
  const asked = typeof sp.f === "string" ? sp.f : null;
  const found = Boolean(asked && forms.some((f) => f.id === asked));
  const sel = found ? asked : forms[0]?.id ?? null;
  const detail = sel ? await getForm(ctx.supabase, ctx.orgId, sel) : null;
  return <FormsView initialForms={forms} initialDetail={detail} initialMobileOpen={found} canAddPeople={canEditPeople(ctx)} />;
}
