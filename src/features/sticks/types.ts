import type { FamilyRole, PeopleFilters, PersonField, PersonLite, Relationship } from "./domain";

// View model de uma Stick para a UI (campos próprios da tabela `sticks` +
// grupo resolvido de group_members). Sub-campos ainda no app_state legado
// (milestones, household) entram quando aquelas features migrarem — ver
// docs/migration-matrix.md §D2.
export interface Person {
  id: string;
  name: string;
  relationship: Relationship;
  isLeader: boolean;
  campus: string;
  lastSeen: string | null;
  followup: boolean;
  firstVisit: string | null;
  source: string | null;
  birthDate: string | null;
  journeyStage: string;
  group: string;
  email: string | null; // e-mail da pessoa (para convidar ao app); nulo = sem e-mail
  userId: string | null; // conta ligada (auth.users) via sticks.user_id; nulo = ficha sem login
}

// ---- Pessoas (spec 13) ------------------------------------------------------------------
// Linha da lista: o mínimo para filtrar, buscar e desenhar.
export interface PersonListItem extends PersonLite {
  photoUrl: string | null;
}

export interface FamilyMember {
  stickId: string;
  name: string;
  role: FamilyRole;
}

export interface Family {
  id: string;
  name: string;
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
  members: FamilyMember[];
}

// Ficha inteira. `values` guarda o texto de cada campo editável ("" = vazio; datas em ISO;
// líder como "true"/"false"), assim a tela desenha e salva todos do mesmo jeito.
export interface PersonDetail {
  id: string;
  values: Record<PersonField, string>;
  archived: boolean;
  photoUrl: string | null;
  family: Family | null;
  tithes: { year: number; total: number; count: number; currency: string } | null; // null = sem acesso
  cell: { id: string; name: string; since: string } | null; // célula ativa (left_at nulo) e desde quando
  serves: { id: string; name: string; roles: string[] }[]; // ministérios onde serve (spec 15)
}

// Lista salva: nome + filtros (o mesmo objeto da querystring).
export interface SavedList {
  id: string;
  name: string;
  filters: PeopleFilters;
}
