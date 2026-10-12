import { EncontrosScreen } from "@/features/encontros/components/EncontrosScreen";

// Encontros: a semana + a ficha do culto ou evento. O encontro aberto fica em ?o=<chave>.
export default async function EncontrosPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <EncontrosScreen sp={await searchParams} />;
}
