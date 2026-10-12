// Marca do módulo: o cordeirinho (lã de bolinhas, rosto em tinta) e o wordmark "mercy kids".
// As cores vêm dos tokens do tema, então troca sozinho no escuro. Abaixo de 32px vira a versão
// simples (sem bochechas, traço mais grosso), porque os detalhes da lã viram ruído.
import { Bird, Cat, Dog, Fish, Rabbit, Snail, Squirrel, Turtle, type LucideIcon } from "lucide-react";
import type { RoomAnimal } from "../domain";
import k from "../kids.module.css";

export function Lamb({ size = 48, className }: { size?: number; className?: string }) {
  const small = size < 32;
  const sw = small ? 6 : 4;
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" className={`${k.lamb}${className ? " " + className : ""}`} aria-hidden="true" focusable="false">
      <g className={k.wool} strokeWidth={sw}>
        {small ? (
          <>
            <circle cx="60" cy="34" r="20" />
            <circle cx="34" cy="60" r="20" />
            <circle cx="86" cy="60" r="20" />
            <circle cx="60" cy="88" r="20" />
          </>
        ) : (
          <>
            <circle cx="60" cy="30" r="16" />
            <circle cx="38" cy="38" r="15" />
            <circle cx="82" cy="38" r="15" />
            <circle cx="30" cy="60" r="15" />
            <circle cx="90" cy="60" r="15" />
            <circle cx="40" cy="84" r="16" />
            <circle cx="80" cy="84" r="16" />
            <circle cx="60" cy="92" r="16" />
          </>
        )}
        <circle cx="60" cy="60" r="34" stroke="none" />
      </g>
      <ellipse cx="30" cy="56" rx="12" ry="7" transform="rotate(-20 30 56)" className={k.ink} />
      <ellipse cx="90" cy="56" rx="12" ry="7" transform="rotate(20 90 56)" className={k.ink} />
      <ellipse cx="60" cy="66" rx="24" ry="27" className={k.ink} />
      <circle cx="51" cy="62" r={small ? 6 : 4.5} className={k.eye} />
      <circle cx="69" cy="62" r={small ? 6 : 4.5} className={k.eye} />
      {small ? null : (
        <>
          <circle cx="44" cy="74" r="4" className={k.cheek} />
          <circle cx="76" cy="74" r="4" className={k.cheek} />
          <path d="M53 78 Q60 84 67 78" fill="none" className={k.smile} strokeWidth="3" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}

export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "sm" ? 28 : size === "md" ? 40 : 64;
  return (
    <span className={`${k.wordmark} ${k[`wm_${size}`]}`}>
      <Lamb size={px} />
      <span>
        mercy <b>kids</b>
      </span>
    </span>
  );
}

export const ANIMAL_ICON: Record<RoomAnimal, LucideIcon> = {
  rabbit: Rabbit,
  bird: Bird,
  fish: Fish,
  turtle: Turtle,
  squirrel: Squirrel,
  snail: Snail,
  cat: Cat,
  dog: Dog,
};
export const ANIMAL_LABEL: Record<RoomAnimal, string> = {
  rabbit: "Coelho",
  bird: "Passarinho",
  fish: "Peixe",
  turtle: "Tartaruga",
  squirrel: "Esquilo",
  snail: "Caracol",
  cat: "Gato",
  dog: "Cachorro",
};
