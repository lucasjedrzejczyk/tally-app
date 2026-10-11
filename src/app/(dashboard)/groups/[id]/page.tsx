import { GroupsScreen } from "@/features/groups/components/GroupsScreen";

// Ficha aberta direto pela URL: mesma tela, já com esta célula selecionada.
export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GroupsScreen sp={{}} forcedId={id} />;
}
