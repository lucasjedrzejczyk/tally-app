import { redirect } from "next/navigation";

// O módulo de Times virou Ministérios (spec 15): ministério com funções, sem o nível "Time".
export default function TeamsPage() {
  redirect("/ministries");
}
