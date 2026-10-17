"use client";

// Assinar (spec 20): mensal ou anual e, se a igreja ainda não tem, CPF ou CNPJ de quem paga.
// A action leva para a fatura do Asaas, onde a pessoa escolhe Pix, boleto ou cartão.
import { useActionState } from "react";
import { subscribeAction } from "../actions";

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function SubscribeForm({ monthly, yearly, needsDoc }: { monthly: number; yearly: number; needsDoc: boolean }) {
  const [state, action, pending] = useActionState(subscribeAction, null);
  return (
    <form action={action} className="panel" style={{ marginTop: 16, display: "grid", gap: 12, maxWidth: 420 }}>
      <strong>Assinar</strong>
      <label>
        <input type="radio" name="cycle" value="MONTHLY" defaultChecked /> Mensal, {brl(monthly)} por mês
      </label>
      {yearly ? (
        <label>
          <input type="radio" name="cycle" value="YEARLY" /> Anual, {brl(yearly)} por ano
        </label>
      ) : null}
      {needsDoc ? (
        <label style={{ display: "grid", gap: 4 }}>
          CPF ou CNPJ de quem paga
          <input name="doc" inputMode="numeric" required autoComplete="off" />
        </label>
      ) : null}
      {state && !state.success ? <div className="gerr">{state.message}</div> : null}
      <button className="btn" type="submit" disabled={pending}>
        {pending ? "Abrindo a fatura..." : "Assinar"}
      </button>
      <span className="muted">Você paga por Pix, boleto ou cartão. O plano libera assim que o pagamento cair.</span>
    </form>
  );
}
