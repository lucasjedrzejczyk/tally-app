// Cuidado (spec 17). IDs de PESSOA divergem por papel:
//  - `stickId` = a pessoa cuidada (sticks);
//  - `assignedTo`/`createdBy`/autor = equipe (auth.users), nome via profiles.
// Caso sigiloso é barrado no banco (RLS m71): só responsável, quem abriu e care.manage.

export type CareStatus = "new" | "assigned" | "in_progress" | "waiting" | "resolved" | "closed";
export type StatusGroup = "open" | "waiting" | "done";
export type ContactKind = "visit" | "call" | "whatsapp" | "talk";

export interface CareListItem {
  id: string;
  stickId: string | null;
  name: string; // pessoa cuidada
  photoUrl: string | null;
  phone: string;
  reason: string; // care_items.title
  assignedTo: string | null;
  assignedName: string;
  status: CareStatus;
  confidential: boolean;
  lastContact: string | null; // date
  nextStep: string;
  nextDate: string; // date | ""
  createdBy: string | null;
  createdOn: string; // date
}

export interface TimelineEntry {
  id: string;
  kind: "contact" | "note";
  method: ContactKind | "";
  text: string;
  at: string; // ISO (contato: data; nota: timestamp)
  byName: string;
}

export interface CareDetail extends CareListItem {
  timeline: TimelineEntry[];
}

// Alguém da equipe (responsável possível).
export interface StaffOption {
  id: string; // auth.users id
  name: string;
}

export interface Suggestion {
  key: string; // signal_overrides.signal_key (muda quando o fato muda)
  stickId: string;
  name: string;
  photoUrl: string | null;
  reason: string;
}
