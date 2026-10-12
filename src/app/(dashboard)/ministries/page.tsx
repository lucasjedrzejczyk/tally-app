import { MinistriesScreen } from "@/features/ministries/components/MinistriesScreen";

// Ministérios: lista + ficha. O ministério aberto fica em ?m=<id>.
export default async function MinistriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <MinistriesScreen sp={await searchParams} />;
}
