// Formulários (spec 19): lógica pura. Perguntas, pontos de partida, leitura segura do jsonb,
// texto das respostas e a planilha (CSV). O banco (submit_form, m73) valida de novo no envio.
export type FieldType = "short" | "long" | "choice" | "multi" | "date";
export interface FormField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: string[];
}
export type Answer = string | string[];
export type Answers = Record<string, Answer>;

export const FIELD_TYPES: { key: FieldType; label: string }[] = [
  { key: "short", label: "Resposta curta" },
  { key: "long", label: "Parágrafo" },
  { key: "choice", label: "Uma opção" },
  { key: "multi", label: "Várias opções" },
  { key: "date", label: "Data" },
];
export const TITLE_MAX = 120;
export const INTRO_MAX = 600;
export const LABEL_MAX = 200;
export const OPTION_MAX = 80;
export const FIELDS_MAX = 30;
export const ANSWER_MAX = 2000;
export const NAME_MAX = 80;
export const PHONE_MAX = 30;

const TYPES = new Set<string>(FIELD_TYPES.map((t) => t.key));
export const hasOptions = (t: FieldType): boolean => t === "choice" || t === "multi";

/** Id curto e estável para uma pergunta nova (não precisa ser global, só único no formulário). */
export function newFieldId(taken: string[]): string {
  let i = taken.length + 1;
  while (taken.includes(`q${i}`)) i++;
  return `q${i}`;
}

/** Lê o jsonb do banco sem confiar nele: o que não for pergunta válida cai fora. */
export function readFields(v: unknown): FormField[] {
  if (!Array.isArray(v)) return [];
  const out: FormField[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.type !== "string" || !TYPES.has(r.type)) continue;
    const options = Array.isArray(r.options) ? r.options.filter((o): o is string => typeof o === "string") : [];
    out.push({ id: r.id, label: r.label, type: r.type as FieldType, required: r.required === true, options });
  }
  return out;
}

/** Limpa o que a tela mandou antes de gravar. Devolve as perguntas boas ou a frase do problema. */
export function cleanFields(fields: FormField[]): FormField[] | string {
  if (fields.length > FIELDS_MAX) return `No máximo ${FIELDS_MAX} perguntas.`;
  const ids = new Set<string>();
  const out: FormField[] = [];
  for (const f of fields) {
    const label = f.label.trim().slice(0, LABEL_MAX);
    if (!label) return "Toda pergunta precisa de um texto.";
    if (!/^[a-z0-9]{1,12}$/.test(f.id) || ids.has(f.id) || !TYPES.has(f.type)) return "Pergunta inválida.";
    ids.add(f.id);
    const options = hasOptions(f.type) ? [...new Set(f.options.map((o) => o.trim().slice(0, OPTION_MAX)).filter(Boolean))] : [];
    if (hasOptions(f.type) && options.length < 2) return `"${label}" precisa de pelo menos duas opções.`;
    out.push({ id: f.id, label, type: f.type, required: f.required, options });
  }
  return out;
}

/** Opções digitadas uma por linha viram lista. */
export const optionsFromText = (text: string): string[] => text.split("\n").map((o) => o.trim()).filter(Boolean);

export interface Template {
  key: string;
  title: string;
  intro: string;
  fields: FormField[];
}
const q = (id: string, label: string, type: FieldType, required = false, options: string[] = []): FormField => ({ id, label, type, required, options });

/** Pontos de partida do "Novo formulário". */
export const TEMPLATES: Template[] = [
  { key: "blank", title: "Novo formulário", intro: "", fields: [] },
  {
    key: "visitor",
    title: "Ficha de visitante",
    intro: "Que bom ter você com a gente! Conta um pouco sobre você.",
    fields: [
      q("q1", "Como conheceu a igreja?", "choice", false, ["Convite de alguém", "Redes sociais", "Passando na rua", "Outro"]),
      q("q2", "Data de nascimento", "date"),
      q("q3", "Bairro", "short"),
      q("q4", "Quer receber uma visita ou ligação?", "choice", false, ["Sim", "Não, obrigado"]),
      q("q5", "Pedido de oração", "long"),
    ],
  },
  {
    key: "signup",
    title: "Inscrição",
    intro: "Preencha para garantir sua vaga.",
    fields: [q("q1", "E-mail", "short"), q("q2", "Quantas pessoas vêm com você?", "short"), q("q3", "Alguma observação?", "long")],
  },
  {
    key: "baptism",
    title: "Pedido de batismo",
    intro: "Ficamos felizes com a sua decisão. A equipe vai falar com você.",
    fields: [
      q("q1", "Data de nascimento", "date", true),
      q("q2", "Já fez o curso de batismo?", "choice", true, ["Sim", "Não", "Estou fazendo"]),
      q("q3", "Conte um pouco da sua história com Jesus", "long"),
    ],
  },
];

/** Resposta em texto para a tela e a planilha (data em dd/mm/aaaa, várias opções com vírgula). */
export function answerText(f: Pick<FormField, "type">, a: Answer | undefined): string {
  if (a === undefined) return "";
  if (Array.isArray(a)) return a.join(", ");
  if (f.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(a)) return `${a.slice(8, 10)}/${a.slice(5, 7)}/${a.slice(0, 4)}`;
  return a;
}

/** Lê as respostas do jsonb (só texto ou lista de texto). */
export function readAnswers(v: unknown): Answers {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Answers = {};
  for (const [k, a] of Object.entries(v as Record<string, unknown>)) {
    if (typeof a === "string") out[k] = a;
    else if (Array.isArray(a)) out[k] = a.filter((x): x is string => typeof x === "string");
  }
  return out;
}

/** Primeira resposta preenchida (o resumo da linha). */
export function firstAnswer(fields: FormField[], a: Answers): string {
  for (const f of fields) {
    const t = answerText(f, a[f.id]);
    if (t) return t;
  }
  return "";
}

/** O que falta na tela antes de mandar (o banco confere de novo). */
export function missingRequired(fields: FormField[], a: Answers): FormField | null {
  return fields.find((f) => f.required && !(Array.isArray(a[f.id]) ? (a[f.id] as string[]).length : String(a[f.id] ?? "").trim())) ?? null;
}

const csvCell = (v: string): string => (/[";\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** Planilha para o Excel brasileiro: separador ";" e BOM para os acentos. */
export function toCsv(fields: FormField[], rows: { name: string; phone: string; createdAt: string; answers: Answers }[]): string {
  const head = ["Data", "Nome", "Telefone", ...fields.map((f) => f.label)];
  const body = rows.map((r) => [shortDateTime(r.createdAt), r.name, r.phone, ...fields.map((f) => answerText(f, r.answers[f.id]))]);
  return "﻿" + [head, ...body].map((line) => line.map(csvCell).join(";")).join("\r\n");
}

/** "14/10 19:05" no horário de Brasília. */
export function shortDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", "");
}

/** "12 respostas" / "1 resposta" / "Nenhuma resposta". */
export function responsesLabel(n: number): string {
  return n === 0 ? "Nenhuma resposta" : n === 1 ? "1 resposta" : `${n} respostas`;
}

/** Só os dígitos, sem o 55 do Brasil, para comparar telefones escritos de jeitos diferentes. */
export function phoneKey(raw: string): string {
  const d = raw.replace(/\D/g, "");
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}
