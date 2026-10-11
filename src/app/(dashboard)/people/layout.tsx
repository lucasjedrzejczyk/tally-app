import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/session";

// Pessoas: só a equipe. Líder de célula volta para as células dele.
export default async function PeopleLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
