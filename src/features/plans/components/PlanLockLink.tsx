// Botão de um recurso do plano Igreja dentro de uma tela liberada (ex.: Recibo em Finanças):
// no grátis vira um link com cadeado para a vitrine de planos. Não é segurança, é convite.
import Link from "next/link";
import { Lock } from "lucide-react";

export function PlanLockLink({ children }: { children: React.ReactNode }) {
  return (
    <Link className="link" href="/plans" title="Recurso do plano Igreja">
      <Lock size={12} aria-hidden="true" /> {children}
    </Link>
  );
}
