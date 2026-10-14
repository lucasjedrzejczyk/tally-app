// Consultas de Formulários (spec 19). A RLS é a barreira: sem forms.manage nada volta.
import type { DB } from "@/lib/auth/session";
import { readAnswers, readFields, type Answers, type FormField } from "./domain";

export interface FormListItem {
  id: string;
  title: string;
  open: boolean;
  count: number;
  unseen: number;
}
export interface FormResponse {
  id: string;
  name: string;
  phone: string;
  answers: Answers;
  stickId: string | null;
  stickName: string | null;
  seen: boolean;
  createdAt: string;
}
export interface FormDetail {
  id: string;
  title: string;
  intro: string;
  fields: FormField[];
  open: boolean;
  token: string;
  responses: FormResponse[];
}

export async function listForms(supabase: DB, orgId: string): Promise<FormListItem[]> {
  const [forms, resp] = await Promise.all([
    supabase.from("forms").select("id, title, open, created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    supabase.from("form_responses").select("form_id, seen").eq("org_id", orgId),
  ]);
  const count = new Map<string, { n: number; unseen: number }>();
  for (const r of resp.data ?? []) {
    const c = count.get(r.form_id) ?? { n: 0, unseen: 0 };
    c.n++;
    if (!r.seen) c.unseen++;
    count.set(r.form_id, c);
  }
  return (forms.data ?? []).map((f) => ({ id: f.id, title: f.title, open: f.open, count: count.get(f.id)?.n ?? 0, unseen: count.get(f.id)?.unseen ?? 0 }));
}

export async function getForm(supabase: DB, orgId: string, id: string): Promise<FormDetail | null> {
  const { data: f } = await supabase.from("forms").select("id, title, intro, fields, open, token").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (!f) return null;
  const { data: rows } = await supabase
    .from("form_responses")
    .select("id, name, phone, answers, stick_id, seen, created_at, sticks(full_name)")
    .eq("form_id", id)
    .order("created_at", { ascending: false });
  return {
    id: f.id,
    title: f.title,
    intro: f.intro,
    fields: readFields(f.fields),
    open: f.open,
    token: f.token,
    responses: (rows ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      phone: r.phone ?? "",
      answers: readAnswers(r.answers),
      stickId: r.stick_id,
      stickName: r.sticks?.full_name ?? null,
      seen: r.seen,
      createdAt: r.created_at,
    })),
  };
}
