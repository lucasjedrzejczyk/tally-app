// Consultas de Sticks (centralizadas por feature; sem blocos de query soltos na
// UI). Só os campos necessários, tipadas, tratando ausência. RLS filtra por org;
// o filtro explícito por org_id é defesa em profundidade, não substitui o RLS.
import type { DB } from "@/lib/auth/session";
import { rowToProfile } from "@/features/settings/fiscal";
import type { Family, Person, PersonDetail, PersonListItem, SavedList } from "./types";
import { journeyCodeForPosition, parseFilters, PHOTO_BUCKET, statusValue, type FamilyRole, type PersonField, type Relationship, RELATIONSHIPS } from "./domain";

export function asRelationship(v: string): Relationship {
  return (RELATIONSHIPS as string[]).includes(v) ? (v as Relationship) : "member";
}

// Todas as Sticks ativas de uma org, já com campus, estágio de jornada e grupo
// (de group_members) resolvidos. Ordenadas por nome.
export async function listSticks(supabase: DB, orgId: string): Promise<Person[]> {
  const [sticksRes, stagesRes, campusRes, membersRes, groupsRes] = await Promise.all([
    supabase
      .from("sticks")
      .select(
        "id, full_name, relationship_status, is_leader, primary_campus_id, last_seen_at, followup_open, first_visit_date, source, birth_date, journey_stage_id, email, user_id",
      )
      .eq("org_id", orgId)
      .eq("archived", false)
      .order("full_name"),
    supabase.from("journey_stages").select("id, position"),
    supabase.from("campuses").select("id, name").eq("org_id", orgId),
    supabase.from("group_members").select("stick_id, group_id, status").eq("status", "active"),
    supabase.from("groups").select("id, name").eq("org_id", orgId),
  ]);

  if (sticksRes.error) throw new Error(sticksRes.error.message);

  const positionById = new Map<string, number>();
  for (const s of stagesRes.data ?? []) positionById.set(s.id, s.position);

  const campusById = new Map<string, string>();
  for (const c of campusRes.data ?? []) campusById.set(c.id, c.name);

  const groupNameById = new Map<string, string>();
  for (const g of groupsRes.data ?? []) groupNameById.set(g.id, g.name);

  const groupByStick = new Map<string, string>();
  for (const m of membersRes.data ?? []) {
    if (!groupByStick.has(m.stick_id)) {
      groupByStick.set(m.stick_id, groupNameById.get(m.group_id) ?? "");
    }
  }

  return (sticksRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.full_name,
    relationship: asRelationship(row.relationship_status),
    isLeader: row.is_leader,
    campus: (row.primary_campus_id && campusById.get(row.primary_campus_id)) || "",
    lastSeen: row.last_seen_at,
    followup: row.followup_open,
    firstVisit: row.first_visit_date,
    source: row.source,
    birthDate: row.birth_date,
    journeyStage: journeyCodeForPosition(row.journey_stage_id ? positionById.get(row.journey_stage_id) : null),
    group: groupByStick.get(row.id) ?? "",
    email: row.email,
    userId: row.user_id,
  }));
}

// Nomes de grupos da org (para o select do formulário de pessoa).
export async function listGroupNames(supabase: DB, orgId: string): Promise<string[]> {
  const { data, error } = await supabase.from("groups").select("name").eq("org_id", orgId).order("name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((g) => g.name);
}

// ---- Pessoas (spec 13) ------------------------------------------------------------------
const SIGNED_SECONDS = 3600;

async function signedPhotoUrls(supabase: DB, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, SIGNED_SECONDS);
  for (const r of data ?? []) if (r.path && r.signedUrl) urls.set(r.path, r.signedUrl);
  return urls;
}

// Lista de Pessoas: só os campos da lista, mais as células (grupos ativos) de cada um.
// Arquivados vêm junto; quem decide mostrar é o filtro (chip Inativos).
export async function listPeople(
  supabase: DB,
  orgId: string,
): Promise<{ people: PersonListItem[]; groups: { id: string; name: string }[] }> {
  const [sticksRes, membersRes, groupsRes] = await Promise.all([
    supabase
      .from("sticks")
      .select("id, full_name, relationship_status, church_office, phone, whatsapp, email, birth_date, profile_photo, archived")
      .eq("org_id", orgId)
      .order("full_name"),
    supabase.from("group_members").select("stick_id, group_id").is("left_at", null),
    supabase.from("groups").select("id, name").eq("org_id", orgId).eq("archived", false).order("name"),
  ]);
  if (sticksRes.error) throw new Error(sticksRes.error.message);

  const groups = groupsRes.data ?? [];
  const known = new Set(groups.map((g) => g.id));
  const byStick = new Map<string, string[]>();
  for (const m of membersRes.data ?? []) {
    if (!known.has(m.group_id)) continue;
    byStick.set(m.stick_id, [...(byStick.get(m.stick_id) ?? []), m.group_id]);
  }
  const rows = sticksRes.data ?? [];
  const urls = await signedPhotoUrls(supabase, rows.flatMap((r) => (r.profile_photo ? [r.profile_photo] : [])));

  return {
    groups,
    people: rows.map((r) => ({
      id: r.id,
      name: r.full_name,
      status: asRelationship(r.relationship_status),
      office: r.church_office ?? "",
      phone: r.phone ?? "",
      whatsapp: r.whatsapp ?? "",
      email: r.email ?? "",
      birthDate: r.birth_date,
      archived: r.archived,
      groupIds: byStick.get(r.id) ?? [],
      photoUrl: r.profile_photo ? urls.get(r.profile_photo) ?? null : null,
    })),
  };
}

function asRole(v: string): FamilyRole {
  return v === "head" || v === "spouse" || v === "child" ? v : "other";
}

// Família (casa) com os membros e o endereço.
export async function loadFamily(supabase: DB, householdId: string): Promise<Family | null> {
  const [hhRes, memRes] = await Promise.all([
    supabase.from("households").select("*").eq("id", householdId).maybeSingle(),
    supabase.from("household_members").select("stick_id, relationship_type, sticks(full_name)").eq("household_id", householdId),
  ]);
  const h = hhRes.data;
  if (!h) return null;
  return {
    id: h.id,
    name: h.name,
    line1: h.address_line_1 ?? "",
    line2: h.address_line_2 ?? "",
    city: h.city ?? "",
    state: h.state ?? "",
    postalCode: h.postal_code ?? "",
    members: (memRes.data ?? []).map((m) => ({ stickId: m.stick_id, name: m.sticks?.full_name ?? "", role: asRole(m.relationship_type) })),
  };
}

// Ficha inteira. Documentos só chegam para quem tem members.manage (RLS: sem permissão, sem linha).
// Dízimos do ano corrente só quando `withTithes` (quem tem finance.manage).
export async function getPerson(supabase: DB, orgId: string, id: string, withTithes: boolean): Promise<PersonDetail | null> {
  const { data: s, error } = await supabase.from("sticks").select("*").eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!s) return null;

  const year = new Date().getFullYear();
  const [docRes, linkRes, titheRes, cellRes] = await Promise.all([
    supabase.from("stick_documents").select("cpf, rg").eq("stick_id", id).maybeSingle(),
    supabase.from("household_members").select("household_id").eq("stick_id", id).maybeSingle(),
    withTithes
      ? supabase
          .from("donations")
          .select("amount, currency")
          .eq("org_id", orgId)
          .eq("stick_id", id)
          .gte("donation_date", `${year}-01-01`)
          .lte("donation_date", `${year}-12-31`)
      : Promise.resolve(null),
    supabase.from("group_members").select("joined_at, groups(id, name, archived)").eq("stick_id", id).is("left_at", null).limit(1).maybeSingle(),
  ]);

  const family = linkRes.data ? await loadFamily(supabase, linkRes.data.household_id) : null;

  const tithes = titheRes
    ? {
        year,
        total: (titheRes.data ?? []).reduce((sum, d) => sum + (Number(d.amount) || 0), 0),
        count: (titheRes.data ?? []).length,
        currency: titheRes.data?.[0]?.currency ?? "BRL",
      }
    : null;

  const values: Record<PersonField, string> = {
    name: s.full_name,
    phone: s.phone ?? "",
    whatsapp: s.whatsapp ?? "",
    email: s.email ?? "",
    birthDate: s.birth_date ?? "",
    gender: s.gender ?? "",
    maritalStatus: s.marital_status ?? "",
    profession: s.profession ?? "",
    cpf: docRes.data?.cpf ?? "",
    rg: docRes.data?.rg ?? "",
    line1: s.address_line_1 ?? "",
    line2: s.address_line_2 ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    postalCode: s.postal_code ?? "",
    status: statusValue(s.relationship_status),
    firstVisit: s.first_visit_date ?? "",
    conversionDate: s.conversion_date ?? "",
    baptismDate: s.baptism_date ?? "",
    admissionType: s.admission_type ?? "",
    membershipDate: s.membership_date ?? "",
    office: s.church_office ?? "",
    isLeader: s.is_leader ? "true" : "false",
    exitDate: s.exit_date ?? "",
    exitReason: s.exit_reason ?? "",
  };

  const urls = await signedPhotoUrls(supabase, s.profile_photo ? [s.profile_photo] : []);
  const g = cellRes.data?.groups;
  const cell = g && !g.archived ? { id: g.id, name: g.name, since: cellRes.data!.joined_at } : null;
  return { id: s.id, values, archived: s.archived, photoUrl: s.profile_photo ? urls.get(s.profile_photo) ?? null : null, family, tithes, cell };
}

// Listas salvas (filtros nomeados) da org. `filters` é o mesmo objeto da querystring da lista.
export async function listPeopleLists(supabase: DB, orgId: string): Promise<SavedList[]> {
  const { data, error } = await supabase.from("people_lists").select("id, name, filters").eq("org_id", orgId).order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ id: r.id, name: r.name, filters: filtersFromJson(r.filters) }));
}

export function filtersFromJson(json: unknown): SavedList["filters"] {
  const o = json && typeof json === "object" && !Array.isArray(json) ? (json as Record<string, unknown>) : {};
  const flat: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) if (typeof v === "string") flat[k] = v;
  return parseFilters(flat);
}

// Nome da igreja e cidade/UF (do cadastro fiscal, se houver) para as páginas de impressão.
export async function loadChurch(supabase: DB, orgId: string): Promise<{ name: string; city: string; state: string }> {
  const [orgRes, profRes] = await Promise.all([
    supabase.from("organizations").select("name").eq("id", orgId).maybeSingle(),
    supabase.from("org_fiscal_profiles").select("*").eq("org_id", orgId).maybeSingle(),
  ]);
  const p = rowToProfile(profRes.data);
  return { name: orgRes.data?.name ?? "", city: p.address.city, state: p.address.state };
}
