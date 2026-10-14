import { FormsScreen } from "@/features/forms/components/FormsScreen";

// Formulários: lista + ficha (?f=<id>) com respostas e perguntas.
export default async function FormsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <FormsScreen sp={await searchParams} />;
}
