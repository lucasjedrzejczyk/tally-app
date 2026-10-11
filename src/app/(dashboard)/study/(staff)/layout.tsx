import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/session";

// Sermões, séries, mapa, notas e lixeira: só a equipe. Líder de célula volta para as células dele.
export default async function StaffStudyLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
