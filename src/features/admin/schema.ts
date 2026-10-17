// Validação de entrada do painel super-admin (fronteira do servidor). A ação de
// suspender/reativar recebe um org id e um status alvo vindos do FormData — aqui a gente
// confere o formato do uuid e REJEITA (não coage) status fora da união válida, antes de
// tocar a RPC. A barreira real continua sendo is_platform_admin() dentro da RPC.
import type { OrgStatus } from "./domain";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID.test(v);
}

// Status alvo válido ou null (diferente de coerceOrgStatus: aqui um valor inválido é um
// erro do chamador, não algo para "consertar" silenciosamente).
export function parseOrgStatus(v: string): OrgStatus | null {
  return v === "active" || v === "suspended" ? v : null;
}

