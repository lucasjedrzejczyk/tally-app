"use client";

// Painel super-admin (Client). Cabeçalho de métricas + tabela de igrejas ordenável e
// filtrável no cliente (a lógica pura vem de domain.ts). Suspender/reativar vai por
// Server Action com confirmação inline; o RLS/gate da RPC é a barreira real. O plano é
// só LEITURA por ora (gancho de monetização visível). Estado-vazio ensina o contexto.
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/shared/Select";
import { brDate } from "@/lib/utils/date";
import { setOrgStatusAction, grantCourtesyAction } from "../actions";
import {
  billingLabel,
  buildStatTiles,
  filterOrgs,
  nextStatus,
  orgStatusBand,
  orgStatusLabel,
  sortOrgs,
  statusActionLabel,
  type OrgSortKey,
  type PlatformStats,
  type SortDir,
  type StatusFilter,
} from "../domain";
import type { AdminOrg } from "../types";
import styles from "../admin.module.css";

// Colunas da tabela: rótulo + chave de ordenação + se é numérica (alinha à direita).
const COLUMNS: { key: OrgSortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Igreja" },
  { key: "country", label: "País" },
  { key: "plan", label: "Plano" },
  { key: "status", label: "Status" },
  { key: "createdAt", label: "Criada em" },
  { key: "members", label: "Membros", numeric: true },
  { key: "sticks", label: "Contatos", numeric: true },
  { key: "groups", label: "Grupos", numeric: true },
];

export function AdminDashboard({ stats, orgs }: { stats: PlatformStats; orgs: AdminOrg[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [sortKey, setSortKey] = useState<OrgSortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [courtesy, setCourtesy] = useState<{ orgId: string; until: string; reason: string } | null>(null);

  const tiles = useMemo(() => buildStatTiles(stats), [stats]);

  const visible = useMemo(
    () => sortOrgs(filterOrgs(orgs, { query, status }), sortKey, sortDir),
    [orgs, query, status, sortKey, sortDir],
  );

  function toggleSort(key: OrgSortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Texto começa A→Z; número/data começam do maior/mais recente.
      setSortDir(key === "name" || key === "country" || key === "plan" || key === "status" ? "asc" : "desc");
    }
  }

  async function applyStatus(org: AdminOrg) {
    const target = nextStatus(org.status);
    setConfirmId("");
    setBusyId(org.orgId);
    setErr(null);
    const res = await setOrgStatusAction(org.orgId, target);
    setBusyId(null);
    if (res.success) router.refresh();
    else setErr(res.message);
  }

  // Cortesia até a data (vazia = encerra), sempre com motivo.
  async function applyCourtesy(until: string) {
    if (!courtesy) return;
    setBusyId(courtesy.orgId);
    setErr(null);
    const res = await grantCourtesyAction(courtesy.orgId, until, courtesy.reason);
    setBusyId(null);
    if (res.success) {
      setCourtesy(null);
      router.refresh();
    } else setErr(res.message);
  }

  const nothing = orgs.length === 0;
  const noMatch = !nothing && visible.length === 0;

  return (
    <>
      <div>
        <h1 className="page">Plataforma</h1>
        <p className="sub" style={{ margin: 0 }}>
          Todas as igrejas na Mercy. Visão do administrador da plataforma.
        </p>
      </div>

      <div className={styles.stats}>
        {tiles.map((t) => (
          <div key={t.key} className={styles.stat}>
            <div className={styles.statValue}>{t.value}</div>
            <div className={styles.statLabel}>{t.label}</div>
          </div>
        ))}
      </div>

      {err ? <div className={`gerr ${styles.err}`}>{err}</div> : null}

      {nothing ? (
        <div className="panel" style={{ marginTop: 8 }}>
          <div className="empty" style={{ lineHeight: 1.6 }}>
            Nenhuma igreja ainda.
            <br />
            <span className="muted">As igrejas aparecem aqui assim que forem criadas na Mercy.</span>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.toolbar}>
            <input
              className={styles.search}
              type="search"
              placeholder="Buscar por nome ou país…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Buscar igreja"
            />
            <Select
              compact
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
              aria-label="Filtrar por status"
            >
              <option value="all">Todas</option>
              <option value="active">Ativas</option>
              <option value="suspended">Suspensas</option>
            </Select>
            <span className={styles.resultCount}>
              {visible.length} de {orgs.length}
            </span>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  {COLUMNS.map((c) => (
                    <th key={c.key} className={c.numeric ? styles.num : undefined}>
                      <button
                        type="button"
                        className={styles.sortBtn}
                        data-active={sortKey === c.key}
                        onClick={() => toggleSort(c.key)}
                      >
                        <span>{c.label}</span>
                        {sortKey === c.key ? (
                          <span className={styles.sortArrow}>{sortDir === "asc" ? "▲" : "▼"}</span>
                        ) : null}
                      </button>
                    </th>
                  ))}
                  <th style={{ textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {noMatch ? (
                  <tr>
                    <td colSpan={COLUMNS.length + 1}>
                      <div className="empty" style={{ padding: "18px 0" }}>
                        Nenhuma igreja corresponde à busca.
                      </div>
                    </td>
                  </tr>
                ) : (
                  visible.map((o) => (
                    <tr key={o.orgId}>
                      <td className={styles.orgName}>{o.name}</td>
                      <td className={styles.muted2}>{o.country || "—"}</td>
                      <td>
                        {courtesy?.orgId === o.orgId ? (
                          <div className={styles.rowActions} style={{ flexWrap: "wrap", justifyContent: "flex-start" }}>
                            <input
                              type="date"
                              value={courtesy.until}
                              onChange={(e) => setCourtesy({ ...courtesy, until: e.target.value })}
                              aria-label="Cortesia até"
                            />
                            <input
                              placeholder="Motivo"
                              value={courtesy.reason}
                              onChange={(e) => setCourtesy({ ...courtesy, reason: e.target.value })}
                              aria-label="Motivo da cortesia"
                            />
                            <button className="link" type="button" disabled={busyId === o.orgId || !courtesy.until} onClick={() => applyCourtesy(courtesy.until)}>
                              Dar
                            </button>
                            <button className="link" type="button" disabled={busyId === o.orgId} onClick={() => applyCourtesy("")}>
                              Encerrar
                            </button>
                            <button className="link" type="button" onClick={() => setCourtesy(null)}>
                              Fechar
                            </button>
                          </div>
                        ) : (
                          <>
                            <span>{billingLabel(o)}</span>{" "}
                            <button
                              className="link"
                              type="button"
                              onClick={() => {
                                setErr(null);
                                setCourtesy({ orgId: o.orgId, until: "", reason: "" });
                              }}
                            >
                              Dar cortesia até...
                            </button>
                          </>
                        )}
                      </td>
                      <td>
                        <span className={`hb ${orgStatusBand(o.status)}`}>{orgStatusLabel(o.status)}</span>
                      </td>
                      <td className={styles.muted2}>{brDate(o.createdAt.slice(0, 10))}</td>
                      <td className={styles.num}>{o.members}</td>
                      <td className={styles.num}>{o.sticks}</td>
                      <td className={styles.num}>{o.groups}</td>
                      <td>
                        <div className={styles.rowActions}>
                          {confirmId === o.orgId ? (
                            <>
                              <span className={styles.confirmTxt}>
                                {o.status === "active" ? "Suspender esta igreja?" : "Reativar esta igreja?"}
                              </span>
                              <button className="link" type="button" onClick={() => applyStatus(o)}>
                                Sim
                              </button>
                              <button className="link" type="button" onClick={() => setConfirmId("")}>
                                Não
                              </button>
                            </>
                          ) : (
                            <button
                              className="link"
                              type="button"
                              disabled={busyId === o.orgId}
                              onClick={() => {
                                setErr(null);
                                setConfirmId(o.orgId);
                              }}
                            >
                              {busyId === o.orgId ? "Salvando…" : statusActionLabel(o.status)}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
