import type { RoomAnimal, RoomColor } from "./domain";

export interface Room {
  id: string;
  name: string;
  color: RoomColor;
  animal: RoomAnimal;
  minMonths: number;
  maxMonths: number;
  capacity: number | null;
  position: number;
  active: boolean;
}

/** Ficha sensível (kids_profiles). Só chega para quem tem kids.view. */
export interface KidProfile {
  allergies: string;
  careNotes: string;
  authorizedPickup: string;
  pickupBlocked: string;
  photoOk: boolean;
}

export interface Guardian {
  id: string;
  name: string;
  phone: string;
}

/** Uma criança da igreja (papel "filho" numa família) com os responsáveis da família. */
export interface Kid extends KidProfile {
  id: string;
  name: string;
  photoUrl: string | null;
  birth: string | null;
  householdId: string;
  guardians: Guardian[];
}

/** Uma entrada aberta (ainda não saiu). */
export interface Checkin {
  id: string;
  kidId: string;
  roomId: string | null;
  guardianId: string | null;
  code: string;
  date: string;
  at: string;
  /** Ainda não confirmado pelo servidor (entrada otimista). */
  saving?: boolean;
}

export interface ServiceOption {
  id: string;
  name: string;
  weekday: number | null;
  monthWeek: number | null;
  startTime: string | null;
}

/** Presenças por domingo (dia) para o relatório. */
export interface DayCount {
  date: string;
  total: number;
}

/** O que o totem mostra de cada criança: nunca alergia, telefone ou foto. */
export interface TotemKid {
  id: string;
  label: string;
  birth: string | null;
  guardianId: string;
  open: boolean;
}
