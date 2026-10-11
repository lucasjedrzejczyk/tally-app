import { GroupsScreen } from "@/features/groups/components/GroupsScreen";

// Células: lista + ficha. A célula aberta fica em ?g=<id>.
export default async function GroupsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <GroupsScreen sp={await searchParams} />;
}
