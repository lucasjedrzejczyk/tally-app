import { initialsOf } from "@/features/sticks/domain";
import styles from "./Avatar.module.css";

export type AvatarSize = 24 | 32 | 44 | 56;
const SIZE = { 24: styles.s24, 32: styles.s32, 44: styles.s44, 56: styles.s56 } as const;

// Rosto da pessoa: foto (URL assinada, quando houver) ou iniciais. Decorativo: quem usa dá o nome acessível.
export function Avatar({ name, photoUrl, size = 32, className }: { name: string; photoUrl?: string | null; size?: AvatarSize; className?: string }) {
  return (
    <span className={`${styles.avatar} ${SIZE[size]}${className ? " " + className : ""}`} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {photoUrl ? <img src={photoUrl} alt="" /> : initialsOf(name)}
    </span>
  );
}
