import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { LogoMark } from "@/components/shared/LogoMark";
import { readFields } from "@/features/forms/domain";
import { PublicForm } from "@/features/forms/components/PublicForm";
import s from "@/features/forms/forms.module.css";

export const metadata: Metadata = { title: "Formulário", robots: { index: false } };

// Página PÚBLICA de um formulário (sem login, fora do menu). O token é o segredo do link; o RPC
// form_public só devolve formulário aberto, e o envio passa pelo submit_form (m73).
export default async function PublicFormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = await createClient();
  const { data } = await supabase.rpc("form_public", { p_token: token });
  const form = data && typeof data === "object" && !Array.isArray(data) ? (data as Record<string, unknown>) : null;

  return (
    <div className={s.pubPage}>
      <div className={s.pubCard}>
        <LogoMark />
        {form ? (
          <PublicForm token={token} church={String(form.church ?? "")} title={String(form.title ?? "")} intro={String(form.intro ?? "")} fields={readFields(form.fields)} />
        ) : (
          <>
            <div className="gtitle">Formulário</div>
            <div className="gsub">Este formulário não está recebendo respostas.</div>
          </>
        )}
      </div>
    </div>
  );
}
