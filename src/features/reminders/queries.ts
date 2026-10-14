// Consultas dos Lembretes (spec 19). Cada fonte respeita a própria RLS: quem não vê a escala,
// o caso ou o formulário simplesmente não recebe aquele lembrete.
import type { DB } from "@/lib/auth/session";
import { addDays } from "@/features/ministries/domain";
import { buildReminders, ESCALA_DAYS, type Reminder } from "./domain";

export async function listReminders(supabase: DB, orgId: string, me: string, today: string, withForms: boolean): Promise<{ items: Reminder[]; done: string[] }> {
  const [esc, people, care, forms, resp, marks] = await Promise.all([
    supabase
      .from("schedule_assignments")
      .select("id, assignment_date, service_time, role, stick_id, status, ministries(name), sticks(full_name, phone, whatsapp)")
      .eq("org_id", orgId)
      .gte("assignment_date", today)
      .lte("assignment_date", addDays(today, ESCALA_DAYS))
      .neq("status", "declined"),
    supabase.from("sticks").select("id, full_name, phone, whatsapp, birth_date").eq("org_id", orgId).eq("archived", false).not("birth_date", "is", null),
    supabase
      .from("care_items")
      .select("id, next_action, due_date, status, sticks(full_name)")
      .eq("org_id", orgId)
      .eq("assigned_to", me)
      .not("due_date", "is", null)
      .lte("due_date", addDays(today, 1))
      .not("status", "in", "(resolved,closed)"),
    withForms ? supabase.from("forms").select("id, title").eq("org_id", orgId) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    withForms ? supabase.from("form_responses").select("form_id").eq("org_id", orgId).eq("seen", false) : Promise.resolve({ data: [] as { form_id: string }[] }),
    supabase.from("signal_overrides").select("signal_key").eq("org_id", orgId).like("signal_key", "rem:%"),
  ]);

  const unseen = new Map<string, number>();
  for (const r of resp.data ?? []) unseen.set(r.form_id, (unseen.get(r.form_id) ?? 0) + 1);

  const items = buildReminders(
    {
      escalas: (esc.data ?? [])
        .filter((a) => a.assignment_date && a.stick_id)
        .map((a) => ({
          id: a.id,
          date: a.assignment_date ?? today,
          time: a.service_time ?? "",
          role: a.role ?? "",
          ministry: a.ministries?.name ?? "Escala",
          stickId: a.stick_id ?? "",
          name: a.sticks?.full_name ?? "",
          phone: a.sticks?.whatsapp || a.sticks?.phone || "",
          confirmed: a.status === "confirmed",
        })),
      birthdays: (people.data ?? []).map((p) => ({ stickId: p.id, name: p.full_name, phone: p.whatsapp || p.phone || "", birthDate: p.birth_date ?? "" })),
      care: (care.data ?? []).map((c) => ({ id: c.id, name: c.sticks?.full_name ?? "", nextStep: c.next_action ?? "", dueDate: c.due_date ?? "" })),
      forms: (forms.data ?? []).map((f) => ({ id: f.id, title: f.title, unseen: unseen.get(f.id) ?? 0 })),
    },
    today,
  );
  const keys = new Set(items.map((i) => i.key));
  return { items, done: (marks.data ?? []).map((m) => m.signal_key).filter((k) => keys.has(k)) };
}
