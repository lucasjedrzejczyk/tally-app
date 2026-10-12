import { MinistriesScreen } from "@/features/ministries/components/MinistriesScreen";

// Ficha aberta direto pela URL: mesma tela, já com este ministério selecionado.
export default async function MinistryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MinistriesScreen sp={{}} forcedId={id} />;
}
