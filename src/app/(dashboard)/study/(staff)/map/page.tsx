import { redirect } from "next/navigation";

// O mapa de Escrituras saiu (spec 9); o filtro "Livro" de Sermões faz esse papel.
export default function ScriptureMapPage() {
  redirect("/study");
}
