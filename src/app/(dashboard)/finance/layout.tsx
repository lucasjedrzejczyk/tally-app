import type { ReactNode } from "react";
import { requireStaff } from "@/lib/auth/session";

// Finanças: só a equipe (líder de célula volta para as células dele). A básica é do grátis;
// as partes pagas travam dentro da tela e em contador/ e recibo/ (spec 20).
export default async function FinanceLayout({ children }: { children: ReactNode }) {
  await requireStaff();
  return <>{children}</>;
}
