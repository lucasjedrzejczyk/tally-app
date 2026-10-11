// Importar planilha de pessoas (spec 13, B1). Tudo puro: ler o CSV, palpitar as colunas pelo
// cabeçalho, limpar cada linha com as MESMAS regras da ficha (schema.ts) e separar novas de
// já existentes. O navegador e o servidor chamam as mesmas funções (o servidor revalida).
import { csvDate, decodeStatement, splitCsv } from "@/features/finance/statement";
import { FIELD_META, normalize, onlyDigits } from "./domain";
import { validateField } from "./schema";

export const IMPORT_FIELDS = [
  ["name", "Nome"],
  ["status", "Situação"],
  ["phone", "Telefone"],
  ["whatsapp", "WhatsApp"],
  ["email", "E-mail"],
  ["birthDate", "Nascimento"],
  ["gender", "Sexo"],
  ["maritalStatus", "Estado civil"],
  ["line1", "Endereço"],
  ["line2", "Bairro ou complemento"],
  ["city", "Cidade"],
  ["state", "UF"],
  ["postalCode", "CEP"],
  ["cpf", "CPF"],
  ["rg", "RG"],
  ["baptismDate", "Batismo"],
  ["membershipDate", "Membro desde"],
  ["office", "Cargo"],
  ["profession", "Profissão"],
] as const;
export type ImportField = (typeof IMPORT_FIELDS)[number][0];
export type ImportValues = Partial<Record<ImportField, string>>;
export type Mapping = (ImportField | "")[];

export const DOC_FIELDS: readonly ImportField[] = ["cpf", "rg"];
export const BATCH_SIZE = 200;

// Cabeçalhos aceitos (sem acento, minúsculos). O primeiro cabeçalho que bater leva o campo.
const ALIASES: Record<ImportField, string[]> = {
  name: ["nome", "nome completo", "membro", "pessoa"],
  status: ["situacao", "status", "tipo", "vinculo"],
  phone: ["celular", "telefone", "fone", "tel", "telefone celular"],
  whatsapp: ["whatsapp", "whats", "zap"],
  email: ["e-mail", "email", "e mail"],
  birthDate: ["nascimento", "data de nascimento", "data nascimento", "dt nascimento", "aniversario"],
  gender: ["sexo", "genero"],
  maritalStatus: ["estado civil"],
  line1: ["endereco", "rua", "logradouro"],
  line2: ["bairro", "complemento"],
  city: ["cidade", "municipio"],
  state: ["uf", "estado"],
  postalCode: ["cep"],
  cpf: ["cpf"],
  rg: ["rg"],
  baptismDate: ["batismo", "data de batismo", "data batismo", "batizado em"],
  membershipDate: ["membro desde", "data de admissao", "admissao", "data de membresia"],
  office: ["cargo", "funcao"],
  profession: ["profissao"],
};

const header = (s: string): string => normalize(s).replace(/\s+/g, " ");

// Palpite: uma coluna por campo, na ordem em que aparecem; o que não bate fica em "" (ignorar).
export function guessMapping(headers: string[]): Mapping {
  const taken = new Set<ImportField>();
  return headers.map((h) => {
    const key = header(h);
    const hit = (Object.keys(ALIASES) as ImportField[]).find((f) => !taken.has(f) && ALIASES[f].includes(key));
    if (hit) taken.add(hit);
    return hit ?? "";
  });
}

// Bytes do arquivo → cabeçalho e linhas de dados. UTF-8 ou Latin-1; `;` ou `,`.
export function readSheet(bytes: Uint8Array): { headers: string[]; rows: string[][] } {
  const all = splitCsv(decodeStatement(bytes));
  return { headers: all[0] ?? [], rows: all.slice(1) };
}

export interface ImportRow {
  line: number; // nº da linha (cabeçalho = 1; linhas em branco não contam)
  values: ImportValues; // já limpos; vazios não entram
  error: string | null;
}

const pad = (s: string): string => s.padStart(2, "0");

// "5/3/1990", "05/03/90", "1990-03-05" → "1990-03-05". Ano de 2 dígitos que cairia no futuro
// vira 19xx (nascimento "85" é 1985, não 2085).
export function importDate(raw: string, todayIso: string): string | null {
  const t = raw.trim();
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t);
  if (!m) return csvDate(t);
  let year = m[3]!;
  if (year.length === 2) {
    year = `20${year}`;
    if (`${year}-${pad(m[2]!)}-${pad(m[1]!)}` > todayIso) year = `19${m[3]}`;
  }
  return csvDate(`${pad(m[1]!)}/${pad(m[2]!)}/${year}`);
}

const GENDERS: Record<string, string> = { m: "male", masculino: "male", homem: "male", male: "male", f: "female", feminino: "female", mulher: "female", female: "female" };
const MARITAL: Record<string, string> = {
  solteiro: "single", single: "single",
  casado: "married", married: "married",
  "uniao estavel": "stable_union", "stable union": "stable_union", uniao: "stable_union",
  divorciado: "divorced", divorced: "divorced", separado: "divorced",
  viuvo: "widowed", widowed: "widowed",
};
// "Solteiro(a)", "SOLTEIRA", "single" → chave comparável (feminino vira masculino: solteira → solteiro).
const word = (s: string): string => normalize(s).replace(/\(a\)/g, "").replace(/_/g, " ").trim();
const masc = (s: string): string => s.replace(/a$/, "o");

// Sem coluna de situação a pessoa entra como Membro (bulk-actions.ts).
const STATUS: Record<string, string> = {
  membro: "member", member: "member",
  frequentador: "attendee", congregado: "attendee", attendee: "attendee",
  visitante: "visitor_first", visitor: "visitor_first",
  inativo: "inactive", desligado: "inactive", afastado: "inactive", inactive: "inactive",
};

const DATE_FIELDS: readonly ImportField[] = ["birthDate", "baptismDate", "membershipDate"];

// Limpa uma linha com as regras da ficha. Qualquer campo inválido marca a linha com erro
// (a linha não entra; corrigir a planilha e importar de novo pula as que já entraram).
export function cleanValues(raw: ImportValues, todayIso: string): { values: ImportValues; error: string | null } {
  const values: ImportValues = {};
  for (const [field, label] of IMPORT_FIELDS) {
    const v = (raw[field] ?? "").trim();
    if (!v && field !== "name") continue;
    let input = v;
    if (DATE_FIELDS.includes(field)) {
      const iso = importDate(v, todayIso);
      if (!iso) return { values, error: `${label}: data inválida.` };
      input = iso;
    } else if (field === "gender") {
      const g = GENDERS[word(v)];
      if (!g) return { values, error: "Sexo: use Masculino ou Feminino." };
      input = g;
    } else if (field === "status") {
      const k = STATUS[masc(word(v))];
      if (!k) return { values, error: "Situação: use Membro, Frequentador, Visitante ou Inativo." };
      input = k;
    } else if (field === "maritalStatus") {
      const k = MARITAL[masc(word(v))];
      if (!k) return { values, error: "Estado civil: valor não reconhecido." };
      input = k;
    }
    const r = validateField(field, input, todayIso);
    if (!r.ok) return { values, error: field === "name" ? r.error : `${FIELD_META[field].label}: ${r.error}` };
    if (r.text) values[field] = r.text;
  }
  return { values, error: null };
}

// Linhas da planilha → linhas limpas, conforme o mapeamento. Linhas sem nada nas colunas
// escolhidas são ignoradas.
export function buildRows(rows: string[][], mapping: Mapping, todayIso: string): ImportRow[] {
  const out: ImportRow[] = [];
  rows.forEach((cells, i) => {
    const raw: ImportValues = {};
    mapping.forEach((field, col) => {
      const v = (cells[col] ?? "").trim();
      if (field && v && raw[field] === undefined) raw[field] = v;
    });
    if (Object.keys(raw).length === 0) return;
    out.push({ line: i + 2, ...cleanValues(raw, todayIso) });
  });
  return out;
}

export interface Existing {
  names: Set<string>; // nomes normalizados (sem acento, minúsculos)
  cpfs: Set<string>; // só dígitos
}
export type RowKind = "new" | "exists" | "error";

// Nova, já existe (mesmo nome ou CPF, na casa ou antes na própria planilha) ou erro.
export function classifyRows(rows: ImportRow[], existing: Existing): { kinds: RowKind[]; news: number; exists: number; errors: number } {
  const names = new Set(existing.names);
  const cpfs = new Set(existing.cpfs);
  const kinds = rows.map((r): RowKind => {
    if (r.error) return "error";
    const name = normalize(r.values.name ?? "");
    const cpf = onlyDigits(r.values.cpf ?? "");
    if (names.has(name) || (cpf && cpfs.has(cpf))) return "exists";
    names.add(name);
    if (cpf) cpfs.add(cpf);
    return "new";
  });
  const count = (k: RowKind): number => kinds.filter((x) => x === k).length;
  return { kinds, news: count("new"), exists: count("exists"), errors: count("error") };
}
