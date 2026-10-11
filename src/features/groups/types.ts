import type { CellRole } from "./domain";

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
}

export interface CellSessionRow {
  date: string;
  cancelled: boolean;
  present: number;
  of: number; // quantos estavam na célula naquele dia
}

// Ficha inteira da célula.
export interface CellDetail {
  id: string;
  name: string;
  day: string;
  time: string;
  location: string;
  archived: boolean;
  supervisor: { id: string; name: string; access: CellAccess } | null;
  members: CellMember[]; // ativos, em ordem alfabética
  sessions: CellSessionRow[]; // os 8 últimos, recentes primeiro
}

// Encontro de um dia (para reabrir o Marcar presença).
export interface DaySession {
  exists: boolean;
  cancelled: boolean;
  presentIds: string[];
}
