import type { CellRole, SeriesPoint } from "./domain";

// Linha da lista de células (só o que a lista desenha e filtra).
export interface CellListItem {
  id: string;
  name: string;
  day: string; // "Quinta" ou ""
  time: string; // "20:00" ou ""
  location: string;
  supervisorId: string | null;
  supervisorName: string;
  leaderName: string;
  memberCount: number;
  lastSession: string | null; // data do último encontro registrado (inclusive "não teve")
  strip: Pick<SeriesPoint, "date" | "cancelled" | "ratio">[]; // últimos encontros, do mais antigo ao mais novo
  faces: { name: string; photoUrl: string | null }[]; // pilha de rostos (líderes primeiro)
  missing: number; // membros com 3+ faltas seguidas
}

// Situação de acesso ao app de quem lidera: já tem login, pode ser convidado (tem e-mail) ou falta o e-mail.
export type CellAccess = "has" | "ready" | "noEmail";

export interface CellMember {
  stickId: string;
  name: string;
  role: CellRole;
  joinedAt: string;
  lastPresent: string | null;
  streak: number;
  access: CellAccess;
  phone: string; // telefone ou WhatsApp ("" se não tem)
  photoUrl: string | null; // URL assinada; só a equipe lê o bucket, para o líder vem null
}

// Ficha inteira da célula.
export interface CellDetail {
  id: string;
  name: string;
  day: string;
  time: string;
  location: string;
  archived: boolean;
  supervisor: { id: string; name: string; access: CellAccess; photoUrl: string | null } | null;
  members: CellMember[]; // ativos, em ordem alfabética
  sessions: SeriesPoint[]; // os 12 últimos, do mais antigo ao mais novo
}

// Encontro de um dia (para reabrir o Marcar presença).
export interface DaySession {
  exists: boolean;
  cancelled: boolean;
  presentIds: string[];
}
