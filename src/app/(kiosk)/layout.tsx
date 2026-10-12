import type { Metadata } from "next";

// Telas de quiosque (totem): sem menu, sem barra de abas. A sessão continua sendo a da equipe.
export const metadata: Metadata = { title: "Totem · mercy kids" };

export default function KioskLayout({ children }: { children: React.ReactNode }) {
  return children;
}
