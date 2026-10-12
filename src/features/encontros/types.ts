// Encontros (spec 16). Datas ISO ("2026-10-18"), horário "19:00" ou "" (sem horário).
import type { AssignmentStatus, MinistryDetail } from "@/features/ministries/types";

// Culto que repete toda semana.
export interface Service {
  id: string;
  name: string;
  weekday: number | null; // 0 = domingo
  time: string;
  location: string;
}

// O culto num dia (só existe quando alguém mexeu nele).
export interface ServiceDate {
  id: string;
  serviceId: string;
  date: string;
  headcount: number | null;
  visitors: number | null;
  kids: number | null;
  sermonId: string | null;
  cancelled: boolean;
}

export interface EventItem {
  id: string;
  name: string;
  date: string;
  time: string;
  location: string;
  description: string;
  registration: boolean;
  capacity: number | null;
  registered: number;
}

// Um encontro na semana. key = "s:<culto>:<data>" ou "e:<evento>".
export interface Occurrence {
  key: string;
  kind: "service" | "event";
  id: string;
  date: string;
  time: string;
  name: string;
  location: string;
  cancelled: boolean;
  registration: boolean;
  registered: number;
}

export interface ServingFace {
  stickId: string;
  name: string;
  photoUrl: string | null;
  status: AssignmentStatus;
  notified: boolean;
}
export interface Serving {
  ministry: MinistryDetail;
  faces: ServingFace[];
  open: number;
}

// Cartão da semana: o encontro, rostos de quem serve e vagas somadas.
export interface WeekCard extends Occurrence {
  faces: ServingFace[];
  open: number;
}

export interface PlanItem {
  id: string;
  time: string;
  title: string;
  responsible: string;
}

export interface CountPoint {
  date: string;
  headcount: number;
}

export interface SermonRef {
  id: string;
  title: string;
  passage: string;
}

// Ficha do culto num dia.
export interface ServiceDay {
  kind: "service";
  service: Service;
  date: string;
  row: ServiceDate | null;
  plan: PlanItem[]; // ordem do dia
  template: PlanItem[]; // ordem de sempre
  history: CountPoint[]; // últimas contagens (até 8, a mais antiga primeiro)
  sermon: SermonRef | null;
}

export interface Registration {
  id: string;
  stickId: string | null;
  name: string;
  photoUrl: string | null;
  checkedIn: boolean;
}

export interface EventDay {
  kind: "event";
  event: EventItem;
  registrations: Registration[];
}
