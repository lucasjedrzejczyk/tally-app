// Ministérios e escalas (spec 15). Datas como texto ISO ("2026-10-19"); horário "19:00" ou "" (dia inteiro).

export type MinistryRole = "leader" | "co_leader" | "member";
export type AssignmentStatus = "assigned" | "confirmed" | "declined";
export type Access = "has" | "ready" | "noEmail";

export interface Face {
  name: string;
  photoUrl: string | null;
}

// Cartão da lista.
export interface MinistryListItem {
  id: string;
  name: string;
  memberCount: number;
  faces: Face[];
  next: { date: string; time: string } | null; // próximo culto (escala existente ou dia padrão)
  open: number; // vagas sem gente no próximo culto
}

export interface MinistryMember {
  stickId: string;
  name: string;
  role: MinistryRole;
  roles: string[]; // funções que a pessoa faz
  phone: string;
  photoUrl: string | null;
  access: Access;
}

export interface Assignment {
  id: string;
  date: string;
  time: string;
  role: string;
  stickId: string;
  status: AssignmentStatus;
  notifiedAt: string | null;
}

// Ficha inteira. `assignments` = escalas das últimas 5 semanas em diante (para sugestões e próximos cultos).
export interface MinistryDetail {
  id: string;
  name: string;
  serviceId: string | null; // culto da igreja (spec 16); com culto, dia e horário vêm dele
  day: string;
  time: string;
  roles: string[];
  slots: Record<string, number>;
  members: MinistryMember[]; // ativos, em ordem alfabética
  assignments: Assignment[];
}

// Outro ministério com a mesma pessoa no mesmo dia (vem do banco por schedule_conflicts).
export interface Conflict {
  stickId: string;
  time: string;
  ministryName: string;
  role: string;
}
