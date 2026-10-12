import { describe, it, expect } from "vitest";
import { PERMISSION_CATALOG, describeRole, isOwnerRole, isPermissionKey, permissionLabel, permissionsInGroup, sanitizePermissions, validateRoleName } from "./domain";
import type { RoleRow } from "./types";

function role(over: Partial<RoleRow> = {}): RoleRow {
  return { id: "r1", name: "Membro", permissions: [], is_system: true, memberCount: 0, ...over };
}

describe("catálogo de permissões", () => {
  it("bate com o handoff: 15 chaves, sem duplicata", () => {
    expect(PERMISSION_CATALOG).toHaveLength(15);
    expect(new Set(PERMISSION_CATALOG.map((p) => p.key)).size).toBe(15);
  });
  it("reconhece só chave conhecida", () => {
    expect(isPermissionKey("members.manage")).toBe(true);
    expect(isPermissionKey("banco.esvaziar")).toBe(false);
  });
  it("agrupa por assunto", () => {
    expect(permissionsInGroup("Oração").map((p) => p.key)).toEqual(["prayer.view_private", "prayer.manage"]);
  });
  it("rotula em PT-BR e cai na chave se não conhecer", () => {
    expect(permissionLabel("finance.manage")).toBe("Gerenciar financeiro");
    expect(permissionLabel("xpto")).toBe("xpto");
  });
});

describe("sanitizePermissions (guarda de fronteira)", () => {
  it("descarta chave desconhecida e duplicata", () => {
    expect(sanitizePermissions(["care.view", "invalida", "care.view", "org.manage"])).toEqual(["care.view", "org.manage"]);
  });
  it("vazio continua vazio", () => {
    expect(sanitizePermissions([])).toEqual([]);
  });
});

describe("describeRole (resumo da lista)", () => {
  it("Dono tem permissions vazio no banco, mas pode tudo (is_owner)", () => {
    expect(describeRole(role({ name: "Dono" }))).toBe("Acesso total à igreja");
    expect(isOwnerRole(role({ name: "Dono" }))).toBe(true);
    // "Dono" personalizado (não de sistema) não ganha o passe do owner
    expect(isOwnerRole(role({ name: "Dono", is_system: false }))).toBe(false);
  });
  it("cargo sem permissão = acesso básico", () => {
    expect(describeRole(role({ name: "Membro" }))).toBe("Acesso básico");
  });
  it("lista os rótulos das permissões", () => {
    expect(describeRole(role({ name: "Tesoureiro", permissions: ["finance.manage", "members.manage"] }))).toBe("Gerenciar financeiro · Gerenciar equipe e cargos");
  });
});

describe("validateRoleName", () => {
  const existing = [role({ id: "r1", name: "Pastor" }), role({ id: "r2", name: "Tesoureiro" })];
  it("exige nome", () => {
    expect(validateRoleName("  ", existing)).toBe("Dê um nome ao cargo.");
  });
  it("recusa nome repetido (ignorando caixa/espaço)", () => {
    expect(validateRoleName(" pastor ", existing)).toBe("Já existe um cargo com esse nome.");
  });
  it("permite manter o próprio nome ao editar", () => {
    expect(validateRoleName("Pastor", existing, "r1")).toBeNull();
  });
  it("aceita nome novo", () => {
    expect(validateRoleName("Recepção", existing)).toBeNull();
  });
  it("recusa nome longo demais", () => {
    expect(validateRoleName("x".repeat(41), existing)).toBe("Use um nome mais curto (até 40 caracteres).");
  });
});
