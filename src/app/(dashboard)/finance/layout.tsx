import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/session";
import { makeGatedLayout } from "@/features/plans/gatedLayout";

const Gated = makeGatedLayout("finance");

// Finanças: só a equipe (líder de célula volta para as células dele) e só no plano que libera o recurso.
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <Gated>{children}</Gated>;
}
