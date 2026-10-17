// Modelos de front do painel super-admin. Sem I/O: só as formas que a UI, o domínio puro
// e as Server Actions trocam. As linhas vêm das RPCs gated (admin_list_orgs /
// admin_platform_stats) e são mapeadas nas queries, já com os números como number e o
// status coeragido para a união conhecida.
import type { AdminOrgRow, BillingRow } from "./domain";
import type { FlagKey, Rollout } from "@/features/flags/catalog";

export type {
  OrgStatus,
  StatusBand,
  PlatformStats,
  StatTile,
  OrgSortKey,
  SortDir,
  StatusFilter,
  OrgFilter,
} from "./domain";

// Uma igreja na tabela do painel (admin_list_orgs), já mapeada. Estende os campos que
// ordenação/filtro tocam (AdminOrgRow) com a identidade e a moeda.
export interface AdminOrg extends AdminOrgRow, BillingRow {
  orgId: string;
  currency: string | null;
}

// Uma feature flag no painel: o default global (feature_flags) + os overrides por igreja
// (feature_flag_orgs), indexados por org_id para a UI consultar direto.
export interface AdminFlag {
  key: FlagKey;
  description: string;
  enabled: boolean;
  rollout: Rollout;
  overrides: Record<string, boolean>;
}
