import { CareScreen } from "@/features/care/components/CareScreen";

// Cuidado: acompanhamentos (lista + ficha, ?c=<id>) e orações (?tab=oracoes).
export default async function CarePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CareScreen sp={await searchParams} />;
}
