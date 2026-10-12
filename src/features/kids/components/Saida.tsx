"use client";

// Saída por código (spec 18, B3): as mesmas quatro casas da entrada. Busca sozinha na 4ª letra;
// código errado faz as casas tremerem, limpa e volta ao início. Confere no servidor (outra recepção
// pode ter mexido); sem rede, usa a lista do aparelho.
import { useRef, useState } from "react";
import { Sheet } from "@/features/groups/components/Sheet";
import { lookupCodeAction } from "../actions";
import { cleanCode } from "../domain";
import type { Checkin, Kid, Room } from "../types";
import { CodeTiles, buzz } from "./Parts";
import { Pickup } from "./Pickup";
import k from "../kids.module.css";

export function Saida({
  kids,
  rooms,
  open,
  today,
  onDone,
  onUndo,
  onClose,
  theme,
}: {
  kids: Map<string, Kid>;
  rooms: Room[];
  open: Checkin[];
  today: string;
  onDone: (ids: string[]) => void;
  onUndo: (list: Checkin[]) => void;
  onClose: () => void;
  theme: string;
}) {
  const [code, setCode] = useState("");
  const [found, setFound] = useState<Checkin[] | null>(null);
  const [shake, setShake] = useState(false);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  async function type(raw: string) {
    const c = cleanCode(raw);
    setCode(c);
    setMsg("");
    if (c.length < 4) return;
    setBusy(true);
    let list: Checkin[];
    try {
      const r = await lookupCodeAction(c);
      list = r.success ? r.data : [];
    } catch {
      list = open.filter((x) => x.code === c && !x.saving);
    }
    setBusy(false);
    if (list.length) {
      setFound(list);
      return;
    }
    buzz([30, 40, 30]);
    setShake(true);
    setMsg("Não achamos esse código. Confira com o responsável.");
    window.setTimeout(() => {
      setShake(false);
      setCode("");
      input.current?.focus();
    }, 260);
  }

  function reset() {
    setFound(null);
    setCode("");
    setMsg("");
    window.setTimeout(() => input.current?.focus(), 0);
  }

  return (
    <Sheet title="Saída" onClose={onClose} tall className={theme}>
      {found ? (
        <Pickup list={found} kids={kids} rooms={rooms} today={today} onDone={onDone} onUndo={onUndo} onFinished={reset} />
      ) : (
        <div className={k.codeStep}>
          <p className={k.muted}>Digite o código que o responsável mostrar</p>
          <label className={k.codeInput}>
            <CodeTiles code={code} shake={shake} label={`Código digitado: ${code.split("").join(" ") || "vazio"}`} />
            <input
              ref={input}
              value={code}
              onChange={(e) => void type(e.target.value)}
              autoFocus
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={4}
              aria-label="Código de retirada"
              enterKeyHint="search"
              disabled={busy}
            />
          </label>
          <p className={msg ? k.error : k.muted} role={msg ? "alert" : undefined}>
            {busy ? "Procurando…" : msg || "Sem 0, O, 1, I nem L: só letras e números que não confundem."}
          </p>
        </div>
      )}
    </Sheet>
  );
}
