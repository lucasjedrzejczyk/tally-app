// Fontes da identidade mercy kids (spec 18): Baloo 2 nos títulos, números e código; Nunito no resto.
// Só carregadas onde o tema kids é usado (o resto do app continua na Figtree).
import { Baloo_2, Nunito } from "next/font/google";

const baloo = Baloo_2({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-kids-display", display: "swap" });
const nunito = Nunito({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-kids-ui", display: "swap" });

export const kidsFonts = `${baloo.variable} ${nunito.variable}`;
