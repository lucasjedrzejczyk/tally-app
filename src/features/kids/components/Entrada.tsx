"use client";

// Entrada pela equipe (spec 18, B1/B2): busca a família (criança, responsável ou telefone), os filhos
// vêm marcados na sala da idade, quem trouxe, e "Fazer entrada" mostra o código na hora. Sala cheia e
// alergia avisam antes, não depois. Criança nova cadastra ali mesmo e cai na entrada já marcada.
import { useMemo, useState, type FormEvent } from "react";
import { Check, ChevronLeft, Plus, Search, TriangleAlert } from "lucide-react";
import { UiIcon } from "@/components/shared/UiIcon";
import { Select } from "@/components/shared/Select";
import { DateField } from "@/components/shared/DateField";
import { Sheet } from "@/features/groups/components/Sheet";
import { waLink } from "@/features/ministries/domain";
import { newChildAction, searchPeopleAction, type CheckinInput } from "../actions";
import { ageLabel, ageMonths, codeMessage, formatPhone, joinNames, newCode, phoneDigits, roomFor } from "../domain";
import type { Checkin, Kid, Room } from "../types";
import { CodeTiles, KidFace, RoomIcon, badgesText, buzz, KidAvatar } from "./Parts";
import k from "../kids.module.css";

export type CheckinResult = { ok: true; code: string; saving: boolean } | { ok: false; message: string };

type Step = { s: "find" } | { s: "family"; household: string } | { s: "new" } | { s: "code"; code: string; first: string; saving: boolean; kids: Kid[]; phone: string };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export function Entrada({
  kids,
  rooms,
  open,
  today,
  serviceId,
  takenCodes,
  onSubmit,
  onNewKid,
  onClose,
  theme,
}: {
  kids: Kid[];
  rooms: Room[];
  open: Checkin[];
  today: string;
  serviceId: string | null;
  takenCodes: Set<string>;
  onSubmit: (input: CheckinInput) => Promise<CheckinResult>;
  onNewKid: (kid: Kid) => void;
  onClose: () => void;
  theme: string;
}) {
  const [step, setStep] = useState<Step>({ s: "find" });
  const [q, setQ] = useState("");

  const families = useMemo(() => {
    const m = new Map<string, Kid[]>();
    for (const kid of kids) m.set(kid.householdId, [...(m.get(kid.householdId) ?? []), kid]);
    return m;
  }, [kids]);

  const results = useMemo(() => {
    const t = norm(q.trim());
    const digits = phoneDigits(q);
    if (t.length < 2 && digits.length < 4) return [];
    const out: { household: string; list: Kid[] }[] = [];
    for (const [household, list] of families) {
      const gs = list[0]?.guardians ?? [];
      const hit =
        list.some((x) => norm(x.name).includes(t)) ||
        gs.some((g) => norm(g.name).includes(t)) ||
        (digits.length >= 4 && gs.some((g) => phoneDigits(g.phone).includes(digits)));
      if (hit) out.push({ household, list });
    }
    return out.slice(0, 8);
  }, [q, families]);

  const title = step.s === "code" ? "Entrada feita" : step.s === "new" ? "Criança nova" : "Entrada";
  const back =
    step.s === "family" || step.s === "new" ? (
      <button type="button" className="iconbtn" aria-label="Voltar" onClick={() => setStep({ s: "find" })}>
        <UiIcon icon={ChevronLeft} />
      </button>
    ) : null;

  return (
    <Sheet title={title} headExtra={back} onClose={onClose} tall className={theme}>
      {step.s === "find" ? (
        <div className={k.flow}>
          <label className={k.searchBox}>
            <Search size={18} strokeWidth={2} aria-hidden="true" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Criança, responsável ou telefone" aria-label="Buscar família" enterKeyHint="search" />
          </label>
          {results.length ? (
            <ul className={k.families}>
              {results.map(({ household, list }) => (
                <li key={household}>
                  <button type="button" className={k.familyRow} onClick={() => setStep({ s: "family", household })}>
                    <span className={k.stack} aria-hidden="true">
                      {list.slice(0, 3).map((x) => (
                        <KidAvatar key={x.id} name={x.name} photoUrl={x.photoUrl} size={44} />
                      ))}
                    </span>
                    <span className={k.familyText}>
                      <b>{joinNames(list.map((x) => x.name))}</b>
                      <span>{list[0]?.guardians.map((g) => g.name).join(" e ") || "Sem responsável cadastrado"}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : q.trim().length >= 2 ? (
            <p className={k.muted}>Nenhuma família com esse nome ou telefone.</p>
          ) : null}
          <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={() => setStep({ s: "new" })}>
            <Plus size={18} strokeWidth={2.2} aria-hidden="true" />
            Criança nova
          </button>
        </div>
      ) : null}

      {step.s === "family" ? (
        <FamilyStep
          list={families.get(step.household) ?? []}
          rooms={rooms}
          open={open}
          today={today}
          onConfirm={async (chosen, guardianId) => {
            const code = newCode(takenCodes);
            const picked = chosen.map((c) => c.kid);
            const phone = picked[0]?.guardians.find((g) => g.id === guardianId)?.phone ?? picked[0]?.guardians[0]?.phone ?? "";
            setStep({ s: "code", code, first: code, saving: true, kids: picked, phone });
            buzz();
            const r = await onSubmit({ kids: chosen.map((c) => ({ id: c.kid.id, roomId: c.roomId })), guardianId, serviceId, date: today, code, via: "staff" });
            if (!r.ok) {
              setStep({ s: "family", household: step.household });
              return r.message;
            }
            setStep((cur) => (cur.s === "code" ? { ...cur, code: r.code, saving: r.saving } : cur));
            return "";
          }}
        />
      ) : null}

      {step.s === "new" ? (
        <NewChild
          today={today}
          onCreated={(kid) => {
            onNewKid(kid);
            setStep({ s: "family", household: kid.householdId });
          }}
        />
      ) : null}

      {step.s === "code" ? (
        <div className={k.codeStep}>
          <p className={k.muted}>Código de retirada {step.kids.length > 1 ? "de" : "do(a)"} {joinNames(step.kids.map((x) => x.name))}</p>
          <CodeTiles code={step.code} />
          {step.saving ? <span className={k.savingChip}>Salvando</span> : null}
          {step.code !== step.first ? (
            <p className={k.notice} role="status">
              Código mudou: {step.code}. Avise o responsável.
            </p>
          ) : null}
          {step.kids
            .filter((x) => x.allergies)
            .map((x) => (
              <p key={x.id} className={k.allergyLine}>
                <TriangleAlert size={16} strokeWidth={2.2} aria-hidden="true" />
                {x.name.split(" ")[0]} tem alergia: {x.allergies}. Avise a sala.
              </p>
            ))}
          <div className={k.row}>
            {step.phone ? (
              <a className={`${k.big} ${k.bigWa}`} href={waLink(step.phone, codeMessage(step.kids.map((x) => x.name), step.code))} target="_blank" rel="noreferrer">
                Mandar no WhatsApp
              </a>
            ) : null}
            <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={() => setStep({ s: "find" })}>
              Próxima família
            </button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}

function FamilyStep({
  list,
  rooms,
  open,
  today,
  onConfirm,
}: {
  list: Kid[];
  rooms: Room[];
  open: Checkin[];
  today: string;
  onConfirm: (chosen: { kid: Kid; roomId: string }[], guardianId: string | null) => Promise<string>;
}) {
  const inside = new Map(open.map((c) => [c.kidId, c]));
  const [sel, setSel] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(list.filter((x) => !inside.has(x.id)).map((x) => [x.id, roomFor(rooms, x.birth, today)?.id ?? null])),
  );
  const guardians = list[0]?.guardians ?? [];
  const [guardian, setGuardian] = useState<string | null>(guardians[0]?.id ?? null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const chosen = Object.entries(sel);
  const missingRoom = chosen.some(([, r]) => !r);
  const countIn = (roomId: string) => open.filter((c) => c.roomId === roomId && c.date === today).length + chosen.filter(([, r]) => r === roomId).length;

  async function go() {
    setBusy(true);
    setError("");
    const msg = await onConfirm(
      chosen.map(([id, roomId]) => ({ kid: list.find((x) => x.id === id)!, roomId: roomId! })),
      guardian,
    );
    setBusy(false);
    if (msg) setError(msg);
  }

  return (
    <div className={k.flow}>
      <ul className={k.kidRows}>
        {list.map((x) => {
          const already = inside.get(x.id);
          const on = x.id in sel;
          const roomId = sel[x.id] ?? null;
          const room = rooms.find((r) => r.id === roomId);
          const full = room && room.capacity !== null && countIn(room.id) > room.capacity;
          return (
            <li key={x.id} className={`${k.kidRow} ${already ? k.kidRowOff : ""}`}>
              <button
                type="button"
                className={k.kidToggle}
                aria-pressed={on}
                disabled={Boolean(already)}
                onClick={() =>
                  setSel((cur) => {
                    const next = { ...cur };
                    if (on) delete next[x.id];
                    else next[x.id] = roomFor(rooms, x.birth, today)?.id ?? null;
                    return next;
                  })
                }
                aria-label={`${x.name}${badgesText(x, today) ? `, ${badgesText(x, today)}` : ""}`}
              >
                <KidFace kid={x} today={today} size={44} />
                <span className={k.kidText}>
                  <b>{x.name}</b>
                  <span>
                    {already ? `Já está no ${rooms.find((r) => r.id === already.roomId)?.name ?? "kids"}` : x.birth ? ageLabel(ageMonths(x.birth, today)) : "Sem data de nascimento"}
                  </span>
                </span>
                <span className={`${k.check} ${on ? k.checkOn : ""}`} aria-hidden="true">
                  {on ? <Check size={16} strokeWidth={3} /> : null}
                </span>
              </button>
              {on ? (
                <div className={k.roomPick}>
                  {room ? <RoomIcon color={room.color} animal={room.animal} size="sm" /> : null}
                  <Select compact value={roomId ?? ""} onChange={(e) => setSel((cur) => ({ ...cur, [x.id]: e.target.value || null }))} aria-label={`Sala de ${x.name}`}>
                    <option value="">Escolha a sala</option>
                    {rooms.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.capacity !== null ? ` (${countIn(r.id) - (r.id === roomId ? 1 : 0)} de ${r.capacity})` : ""}
                      </option>
                    ))}
                  </Select>
                  {full ? <span className={k.fullTag}>{`${room.name} ${countIn(room.id) - 1} de ${room.capacity}`}</span> : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      {guardians.length ? (
        <div>
          <h3 className={k.subhead}>Quem trouxe</h3>
          <div className={k.chips}>
            {guardians.map((g) => (
              <button key={g.id} type="button" className={k.chip} aria-pressed={guardian === g.id} onClick={() => setGuardian(g.id)}>
                {g.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className={k.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="button" className={`${k.big} ${k.bigIn} ${k.wide}`} disabled={!chosen.length || missingRoom || busy} onClick={go}>
        {missingRoom ? "Escolha a sala" : chosen.length > 1 ? `Fazer entrada das ${chosen.length}` : "Fazer entrada"}
      </button>
    </div>
  );
}

function NewChild({ today, onCreated }: { today: string; onCreated: (kid: Kid) => void }) {
  const [name, setName] = useState("");
  const [birth, setBirth] = useState("");
  const [allergies, setAllergies] = useState("");
  const [gq, setGq] = useState("");
  const [found, setFound] = useState<{ id: string; name: string; phone: string }[]>([]);
  const [guardian, setGuardian] = useState<{ id: string; name: string } | null>(null);
  const [gPhone, setGPhone] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function searchGuardian(v: string) {
    setGq(v);
    setGuardian(null);
    if (v.trim().length < 2) return setFound([]);
    try {
      const r = await searchPeopleAction(v);
      if (r.success) setFound(r.data);
    } catch {
      setFound([]);
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await newChildAction({ name, birth, guardianId: guardian?.id ?? null, guardianName: guardian ? "" : gq, guardianPhone: gPhone, allergies });
      if (r.success) onCreated(r.data);
      else setError(r.message);
    } catch {
      setError("Sem internet agora. Cadastre quando a rede voltar.");
    }
    setBusy(false);
  }

  return (
    <form className={k.flow} onSubmit={save}>
      <label className={k.field}>
        <span>Nome da criança</span>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={120} autoComplete="off" />
      </label>
      <div className={k.field}>
        <span aria-hidden="true">Nascimento</span>
        <DateField value={birth} onChange={setBirth} aria-label="Nascimento" />
        {birth && birth <= today ? <small>{ageLabel(ageMonths(birth, today))}</small> : null}
      </div>
      <label className={k.field}>
        <span>Responsável</span>
        <input value={guardian ? guardian.name : gq} onChange={(e) => void searchGuardian(e.target.value)} placeholder="Busque na igreja ou escreva o nome" maxLength={120} autoComplete="off" />
      </label>
      {!guardian && found.length ? (
        <ul className={k.pickList}>
          {found.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setGuardian({ id: p.id, name: p.name });
                  setFound([]);
                }}
              >
                <KidAvatar name={p.name} size={32} />
                <span>{p.name}</span>
                {p.phone ? <span className={k.muted}>{formatPhone(p.phone)}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {!guardian && gq.trim().length >= 2 ? (
        <label className={k.field}>
          <span>Telefone do responsável</span>
          <input value={formatPhone(gPhone)} onChange={(e) => setGPhone(phoneDigits(e.target.value))} inputMode="tel" placeholder="(47) 99999-9999" />
        </label>
      ) : null}
      <label className={k.field}>
        <span>Alergias</span>
        <input value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="Deixe vazio se não tiver" maxLength={300} />
      </label>
      {error ? (
        <p className={k.error} role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className={`${k.big} ${k.bigIn} ${k.wide}`} disabled={busy || !name.trim() || !birth || !(guardian || gq.trim())}>
        {busy ? "Cadastrando…" : "Cadastrar e fazer entrada"}
      </button>
    </form>
  );
}
