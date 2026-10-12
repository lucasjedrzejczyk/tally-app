// Peças do módulo Crianças: ícone da sala (cor + bicho), as quatro casas do código e o rosto
// da criança com os selos (alergia, aniversário, sem foto, não pode buscar).
import { Cake, CameraOff, ShieldAlert, TriangleAlert } from "lucide-react";
import { Avatar, type AvatarSize } from "@/components/shared/Avatar";
import { birthdayThisWeek, ROOM_COLORS, type RoomAnimal, type RoomColor } from "../domain";
import type { Kid } from "../types";
import { ANIMAL_ICON } from "./Brand";
import k from "../kids.module.css";

export const tone = (c: RoomColor): string => k[`t_${c}`] ?? "";

/** Cor do rosto sem foto: uma das quatro, sempre a mesma para o mesmo nome. */
export function faceTone(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tone(ROOM_COLORS[h % ROOM_COLORS.length]!);
}

/** Rosto no tema kids: sem foto, as iniciais ganham uma cor da paleta em vez do cinza. */
export function KidAvatar({ name, photoUrl, size = 32, className }: { name: string; photoUrl?: string | null; size?: AvatarSize; className?: string }) {
  return <Avatar name={name} photoUrl={photoUrl} size={size} className={`${k.av} ${faceTone(name)}${className ? " " + className : ""}`} />;
}

export function RoomIcon({ color, animal, size = "md" }: { color: RoomColor; animal: RoomAnimal; size?: "sm" | "md" | "lg" }) {
  const Icon = ANIMAL_ICON[animal];
  const px = size === "sm" ? 16 : size === "md" ? 26 : 40;
  return (
    <span className={`${k.roomIcon} ${k[`ri_${size}`]} ${tone(color)}`} aria-hidden="true">
      <Icon size={px} strokeWidth={2} />
    </span>
  );
}

/** As quatro casas do código. `entering` = o código acabou de chegar (escala .9 para 1 no totem). */
export function CodeTiles({ code, size = "md", shake, entering, label }: { code: string; size?: "md" | "lg"; shake?: boolean; entering?: boolean; label?: string }) {
  const chars = [0, 1, 2, 3].map((i) => code[i] ?? "");
  return (
    <span
      className={`${k.tiles} ${size === "lg" ? k.tilesLg : ""} ${shake ? k.shake : ""} ${entering ? k.tilesIn : ""}`}
      role="img"
      aria-label={label ?? (code ? `Código ${code.split("").join(" ")}` : "Código vazio")}
    >
      {chars.map((ch, i) => (
        <span key={i} className={`${k.tile} ${ch ? k.tileOn : ""}`} aria-hidden="true">
          {ch}
        </span>
      ))}
    </span>
  );
}

export interface FaceBadges {
  allergy: boolean;
  birthday: string | null;
  noPhoto: boolean;
  blocked: boolean;
}

export function badgesOf(kid: Pick<Kid, "allergies" | "photoOk" | "pickupBlocked" | "birth">, today: string): FaceBadges {
  return { allergy: Boolean(kid.allergies), birthday: birthdayThisWeek(kid.birth, today), noPhoto: !kid.photoOk, blocked: Boolean(kid.pickupBlocked) };
}

/** Rosto com selos no canto (cada selo tem ícone além da cor: não depende só de cor). */
export function KidFace({ kid, today, size = 56 }: { kid: Pick<Kid, "name" | "photoUrl" | "allergies" | "photoOk" | "pickupBlocked" | "birth">; today: string; size?: AvatarSize }) {
  const b = badgesOf(kid, today);
  return (
    <span className={k.face}>
      <KidAvatar name={kid.name} photoUrl={kid.photoUrl} size={size} />
      <span className={k.badges}>
        {b.blocked ? (
          <span className={`${k.badge} ${k.bBlocked}`} title="Tem quem não pode buscar">
            <ShieldAlert size={12} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : null}
        {b.allergy ? (
          <span className={`${k.badge} ${k.bAllergy}`} title={`Alergia: ${kid.allergies}`}>
            <TriangleAlert size={12} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : null}
        {b.birthday ? (
          <span className={`${k.badge} ${k.bCake}`} title={b.birthday}>
            <Cake size={12} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : null}
        {b.noPhoto ? (
          <span className={`${k.badge} ${k.bNoPhoto}`} title="Sem fotos">
            <CameraOff size={12} strokeWidth={2.4} aria-hidden="true" />
          </span>
        ) : null}
      </span>
    </span>
  );
}

/** Descrição acessível dos selos ("alergia: amendoim, faz 5 anos quinta"). */
export function badgesText(kid: Pick<Kid, "allergies" | "photoOk" | "pickupBlocked" | "birth">, today: string): string {
  const b = badgesOf(kid, today);
  return [b.blocked ? "tem quem não pode buscar" : "", b.allergy ? `alergia: ${kid.allergies}` : "", b.birthday?.toLowerCase() ?? "", b.noPhoto ? "sem fotos" : ""].filter(Boolean).join(", ");
}

/** Vibração curta (ou o padrão dado), quando o aparelho deixa. */
export function buzz(pattern: number | number[] = 12) {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* aparelho sem vibração */
  }
}
