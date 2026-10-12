"use client";

// Totem (spec 18, fase C): tablet na porta, logado pela equipe. O responsável digita o telefone
// (máscara montando, busca sozinha no 11º dígito), toca nos filhos e recebe o código gigante.
// Nunca mostra alergia, telefone nem foto: primeiro nome + inicial e o bicho da sala.
// Espera o servidor antes de mostrar o código (o pai vai embora com ele). Sem rede: "Fale com a recepção".
// "Voltar" sempre no canto de cima; sem toque por 45 s volta ao início; o código some em 20 s
// (anel esvaziando em volta de "Pronto"; tocar pausa). Sair: segurar o cordeiro 3 s.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, Delete } from "lucide-react";
import { checkinAction, totemLookupAction } from "../actions";
import { formatPhone, phoneDigits, roomFor } from "../domain";
import type { Room, TotemKid } from "../types";
import { Lamb, ANIMAL_ICON } from "./Brand";
import { CodeTiles, buzz, tone } from "./Parts";
import k from "../kids.module.css";
import t from "../totem.module.css";

type Step = { s: "phone" } | { s: "pick"; kids: TotemKid[] } | { s: "code"; code: string; names: string[] } | { s: "help"; why: string };
const IDLE_MS = 45000;
const CODE_MS = 20000;
const LABEL: Record<Step["s"], string> = { phone: "Telefone", pick: "Quem vem hoje?", code: "Seu código", help: "Recepção" };

export function TotemView({ rooms, serviceId, today }: { rooms: Room[]; serviceId: string | null; today: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>({ s: "phone" });
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [exitAsk, setExitAsk] = useState(false);
  const [holding, setHolding] = useState(false);
  const idle = useRef<number | undefined>(undefined);
  const codeTimer = useRef<number | undefined>(undefined);
  const hold = useRef<number | undefined>(undefined);

  const restart = useCallback(() => {
    window.clearTimeout(codeTimer.current);
    setStep({ s: "phone" });
    setPhone("");
    setSel(new Set());
    setPaused(false);
  }, []);

  // Sem toque por 45 s fora do início: volta (o próximo pai não pega a família de outro aberta).
  const poke = useCallback(() => {
    window.clearTimeout(idle.current);
    idle.current = window.setTimeout(restart, IDLE_MS);
  }, [restart]);
  useEffect(() => {
    if (step.s === "phone" && !phone) return window.clearTimeout(idle.current);
    if (step.s !== "code") poke();
    return () => window.clearTimeout(idle.current);
  }, [step, phone, poke]);

  // O código some sozinho em 20 s, a não ser que alguém toque (pausa).
  useEffect(() => {
    if (step.s !== "code" || paused) return;
    codeTimer.current = window.setTimeout(restart, CODE_MS);
    return () => window.clearTimeout(codeTimer.current);
  }, [step, paused, restart]);

  const roomOf = (kid: TotemKid) => roomFor(rooms, kid.birth, today);

  async function lookup(digits: string) {
    setBusy(true);
    try {
      const r = await totemLookupAction(digits);
      if (!r.success) setStep({ s: "help", why: r.message });
      else if (!r.data.length) setStep({ s: "help", why: "Não achamos esse telefone." });
      else {
        setSel(new Set(r.data.filter((x) => !x.open && roomOf(x)).map((x) => x.id)));
        setStep({ s: "pick", kids: r.data });
      }
    } catch {
      setStep({ s: "help", why: "Estamos sem internet agora." });
    }
    setBusy(false);
  }

  function press(d: string) {
    if (busy) return;
    const next = phoneDigits(d === "del" ? phone.slice(0, -1) : phone + d);
    setPhone(next);
    if (next.length === 11) void lookup(next);
  }

  async function confirm(kids: TotemKid[]) {
    const chosen = kids.filter((x) => sel.has(x.id));
    const withRoom = chosen.map((x) => ({ id: x.id, roomId: roomOf(x)?.id ?? null }));
    if (!withRoom.length || withRoom.some((x) => !x.roomId)) return;
    setBusy(true);
    try {
      const r = await checkinAction({ kids: withRoom, guardianId: chosen[0]?.guardianId ?? null, serviceId, date: today, code: "", via: "totem" });
      if (r.success) {
        buzz(20);
        setPaused(false);
        setStep({ s: "code", code: r.data.code, names: chosen.map((x) => x.label.split(" ")[0]!) });
      } else setStep({ s: "help", why: r.message });
    } catch {
      setStep({ s: "help", why: "Estamos sem internet agora." });
    }
    setBusy(false);
  }

  function holdStart() {
    window.clearTimeout(hold.current);
    setHolding(true);
    hold.current = window.setTimeout(() => (setHolding(false), setExitAsk(true)), 3000);
  }
  const holdEnd = () => (window.clearTimeout(hold.current), setHolding(false));

  return (
    <div className={t.totem} onPointerDown={step.s === "code" ? () => setPaused(true) : poke}>
      <header className={t.bar}>
        {step.s !== "phone" ? (
          <button type="button" className={t.back} onClick={restart}>
            <ChevronLeft size={28} strokeWidth={2.4} aria-hidden="true" />
            Voltar
          </button>
        ) : (
          <span />
        )}
        <span className={t.stepLabel} aria-live="polite">
          {LABEL[step.s]}
        </span>
        <button
          type="button"
          className={`${t.exit} ${holding ? t.holding : ""}`}
          aria-label="Segure por 3 segundos para sair do totem"
          onPointerDown={holdStart}
          onPointerUp={holdEnd}
          onPointerLeave={holdEnd}
          onPointerCancel={holdEnd}
          onContextMenu={(e) => e.preventDefault()}
        >
          <Lamb size={44} />
          <span className={t.fill} aria-hidden="true" />
        </button>
      </header>

      <main className={t.stage}>
        {step.s === "phone" ? (
          <div className={t.phoneStep}>
            <div className={t.hello}>
              <h1>Olá! Digite seu telefone</h1>
              <p className={`${t.phoneShown} ${phone ? "" : t.placeholder}`} aria-live="polite">
                {busy ? "Procurando…" : formatPhone(phone) || "(47) 99999-9999"}
              </p>
            </div>
            <div className={t.pad} role="group" aria-label="Teclado">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button key={d} type="button" className={t.key} onClick={() => press(d)} disabled={busy}>
                  {d}
                </button>
              ))}
              <span />
              <button type="button" className={t.key} onClick={() => press("0")} disabled={busy}>
                0
              </button>
              <button type="button" className={`${t.key} ${t.keyDel}`} onClick={() => press("del")} disabled={busy || !phone} aria-label="Apagar">
                <Delete size={30} strokeWidth={2} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {step.s === "pick" ? (
          <div className={t.pickStep}>
            <ul className={t.kids}>
              {step.kids.map((x) => {
                const room = roomOf(x);
                const Icon = room ? ANIMAL_ICON[room.animal] : null;
                const on = sel.has(x.id);
                const off = x.open || !room;
                return (
                  <li key={x.id}>
                    <button
                      type="button"
                      className={`${t.kid} ${room ? tone(room.color) : ""}`}
                      aria-pressed={on}
                      disabled={off}
                      onClick={() => setSel((cur) => {
                        const n = new Set(cur);
                        if (n.has(x.id)) n.delete(x.id);
                        else n.add(x.id);
                        return n;
                      })}
                    >
                      <span className={t.kidAvatar} aria-hidden="true">
                        {Icon ? <Icon size={44} strokeWidth={2} /> : x.label[0]}
                        {on ? (
                          <span className={t.kidCheck}>
                            <Check size={22} strokeWidth={3} />
                          </span>
                        ) : null}
                      </span>
                      <b>{x.label}</b>
                      <span>{x.open ? "Já está na sala" : room ? room.name : "Fale com a recepção"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <button type="button" className={`${k.big} ${k.bigIn} ${t.go}`} disabled={!sel.size || busy} onClick={() => confirm(step.kids)}>
              {busy ? "Um instante…" : "Fazer entrada"}
            </button>
          </div>
        ) : null}

        {step.s === "code" ? (
          <div className={t.codeStep}>
            <p className={t.codeFor}>Código de retirada de {step.names.join(" e ")}</p>
            <CodeTiles code={step.code} size="lg" entering />
            <p className={t.photo}>Tire uma foto ou guarde este código. Mostre na saída da sala.</p>
            <button type="button" className={`${t.done} ${paused ? t.donePaused : ""}`} onClick={restart}>
              <svg className={t.ring} viewBox="0 0 120 120" aria-hidden="true">
                <circle cx="60" cy="60" r="56" />
              </svg>
              Pronto
            </button>
          </div>
        ) : null}

        {step.s === "help" ? (
          <div className={t.helpStep} role="alert">
            <Lamb size={120} />
            <h1>Fale com a recepção, vamos te ajudar.</h1>
            <p>{step.why}</p>
          </div>
        ) : null}
      </main>

      {exitAsk ? (
        <div className={t.ask} role="alertdialog" aria-modal="true" aria-label="Sair do totem">
          <div className={t.askBox}>
            <h2>Sair do totem?</h2>
            <p>O aparelho volta para a tela da equipe.</p>
            <div className={k.row}>
              <button type="button" className={`${k.big} ${k.bigGhost}`} onClick={() => setExitAsk(false)}>
                Continuar no totem
              </button>
              <button type="button" className={`${k.big} ${k.bigIn}`} onClick={() => router.push("/kids")}>
                Sair do totem
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
