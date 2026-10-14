import { requireStaff, can } from "@/lib/auth/session";
import { todayIso } from "@/features/groups/domain";
import { listReminders } from "@/features/reminders/queries";
import { RemindersView } from "@/features/reminders/components/RemindersView";

// Lembretes: escalas de hoje e amanhã, aniversários da semana, próximos passos do Cuidado e
// respostas novas de formulário, com a mensagem pronta do WhatsApp.
export default async function RemindersPage() {
  const ctx = await requireStaff();
  const { items, done } = await listReminders(ctx.supabase, ctx.orgId, ctx.user.id, todayIso(), can(ctx, "forms.manage"));
  return <RemindersView items={items} initialDone={done} />;
}
