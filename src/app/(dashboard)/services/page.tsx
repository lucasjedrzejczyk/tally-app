import { redirect } from "next/navigation";

// Cultos, Eventos e Agenda viraram uma tela só: Encontros (spec 16).
export default function Page() {
  redirect("/encontros");
}
