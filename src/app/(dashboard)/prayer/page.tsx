import { redirect } from "next/navigation";

// O mural de oração virou a aba Orações do Cuidado (spec 17).
export default function PrayerPage() {
  redirect("/care?tab=oracoes");
}
