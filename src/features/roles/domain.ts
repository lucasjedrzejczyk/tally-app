// Domínio puro de Cargos (Equipe e cargos) — catálogo de permissões + leitura segura.
// O catálogo espelha docs/handoffs/assentos-papeis.md: a CHAVE é o valor real gravado
// em `roles.permissions` (e lido por has_perm no banco); o rótulo é só a UI.
// Nada aqui toca no Supabase — é testável sozinho.
import type { PermissionKey, PermissionOption, RoleRow } from "./types";

// Catálogo em grupos: a tela mostra as permissões por assunto em vez de uma lista
// longa e plana (design-principles: densidade organizada, ar no lugar de caixas).
export const PERMISSION_CATALOG: PermissionOption[] = [
  { key: "members.manage", label: "Gerenciar equipe e cargos", hint: "Convidar/remover pessoas, atribuir cargos", group: "Administração" },
  { key: "org.manage", label: "Administrar a igreja", hint: "Configurações e dados institucionais/fiscais", group: "Administração" },
  { key: "finance.manage", label: "Gerenciar financeiro", hint: "Lançamentos, categorias, dados fiscais", group: "Administração" },
  { key: "sticks.edit", label: "Editar pessoas", hint: "Criar e alterar Sticks", group: "Pessoas" },
  { key: "care.view", label: "Ver acompanhamentos", group: "Pessoas" },
  { key: "care.manage", label: "Gerenciar acompanhamentos", group: "Pessoas" },
  { key: "prayer.view_private", label: "Ver orações privadas", group: "Oração" },
  { key: "prayer.manage", label: "Gerenciar orações", group: "Oração" },
  { key: "groups.manage_all", label: "Gerenciar todos os grupos", group: "Grupos" },
  { key: "groups.manage_assigned", label: "Gerenciar os grupos de que é líder", group: "Grupos" },
  { key: "ministries.manage_all", label: "Gerenciar ministérios e escalas", group: "Ministérios" },
  { key: "services.manage", label: "Gerenciar cultos e eventos", group: "Encontros" },
  { key: "kids.view", label: "Fazer entrada e saída das crianças", hint: "Recepção e salas", group: "Crianças" },
  { key: "kids.manage", label: "Gerenciar Crianças", hint: "Salas, fichas e saída sem código", group: "Crianças" },
  { key: "communication.send", label: "Enviar comunicações", hint: "Mandar mensagens para um público da igreja", group: "Comunicação" },
];

export const PERMISSION_GROUPS = ["Administração", "Pessoas", "Oração", "Grupos", "Ministérios", "Encontros", "Comunicação"] as const;

const KEYS = new Set<string>(PERMISSION_CATALOG.map((p) => p.key));

export function isPermissionKey(v: string): v is PermissionKey {
  return KEYS.has(v);
}

// Filtra o que veio do formulário para o catálogo conhecido, sem duplicar. Guarda de
// fronteira: nunca gravamos em roles.permissions uma chave que o banco não entende.
export function sanitizePermissions(values: string[]): PermissionKey[] {
  return [...new Set(values.filter(isPermissionKey))];
}

export function permissionLabel(key: string): string {
  return PERMISSION_CATALOG.find((p) => p.key === key)?.label ?? key;
}

export function permissionsInGroup(group: string): PermissionOption[] {
  return PERMISSION_CATALOG.filter((p) => p.group === group);
}

// Resumo das permissões de um cargo para a lista (a tela não cabe 10 rótulos por linha).
// O Dono é o caso especial: `roles.permissions` é vazio de propósito — quem manda é
// `memberships.is_owner`, que ignora o RLS. Dizer "Nenhuma permissão" seria mentira.
export function describeRole(role: RoleRow): string {
  if (isOwnerRole(role)) return "Acesso total à igreja";
  if (role.permissions.length === 0) return "Acesso básico";
  return role.permissions.map(permissionLabel).join(" · ");
}

// O cargo "Dono" é semeado por seed_default_system_roles com permissions vazio.
// Identificamos pelo nome + is_system (não há coluna `code` na tabela roles).
export function isOwnerRole(role: RoleRow): boolean {
  return role.is_system && role.name === "Dono";
}

// Nome do cargo: obrigatório e único dentro da org (a UI avisa antes de o banco recusar).
export function validateRoleName(name: string, existing: RoleRow[], selfId?: string): string | null {
  const clean = name.trim();
  if (!clean) return "Dê um nome ao cargo.";
  if (clean.length > 40) return "Use um nome mais curto (até 40 caracteres).";
  const clash = existing.some((r) => r.id !== selfId && r.name.trim().toLowerCase() === clean.toLowerCase());
  return clash ? "Já existe um cargo com esse nome." : null;
}
