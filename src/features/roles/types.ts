// Modelos de "Equipe e cargos". Fonte da verdade (ver docs/handoffs/assentos-papeis.md):
//  - cargos          → tabela `roles` (name, permissions[], is_system)
//  - quem é quem     → tabela `memberships` (role_id = cargo da pessoa)
//  - nome/e-mail     → tabela `profiles` (juntado no APP: não há FK memberships→profiles)
// A coluna legada `memberships.role` (texto, ex.: 'owner') NÃO é usada aqui.

export type PermissionKey =
  | "members.manage"
  | "org.manage"
  | "finance.manage"
  | "sticks.edit"
  | "care.view"
  | "care.manage"
  | "prayer.view_private"
  | "prayer.manage"
  | "groups.manage_all"
  | "groups.manage_assigned"
  | "ministries.manage_all"
  | "services.manage"
  | "kids.view"
  | "kids.manage"
  | "communication.send";

export interface PermissionOption {
  key: PermissionKey;
  label: string;
  hint?: string;
  group: string;
}

export interface RoleRow {
  id: string;
  name: string;
  permissions: string[];
  is_system: boolean; // cargo padrão da igreja: renomeável/editável, mas o RLS proíbe excluir
  memberCount: number; // quantas pessoas têm este cargo (contado no app)
}

export interface MemberRow {
  id: string; // memberships.id
  userId: string;
  name: string; // profiles.full_name (ou o e-mail, se o perfil ainda não tem nome)
  email: string;
  isOwner: boolean;
  roleId: string | null;
  isSelf: boolean; // você mesmo — a UI avisa antes de você tirar seu próprio acesso
}

export interface TeamData {
  roles: RoleRow[];
  members: MemberRow[];
  canManage: boolean; // members.manage — sem isso a área é somente-leitura
}
