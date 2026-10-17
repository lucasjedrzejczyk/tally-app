// CPF ou CNPJ de quem paga (spec 20). Devolve só os dígitos, ou null se o dígito não fecha.
import { isValidCpf, onlyDigits } from "@/features/sticks/domain";

export function isValidCnpj(raw: string): boolean {
  const d = onlyDigits(raw);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const dv = (n: number) => {
    const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = w.reduce((s, x, i) => s + x * Number(d[i]), 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === Number(d[12]) && dv(13) === Number(d[13]);
}

export function parseBillingDoc(raw: string): string | null {
  const d = onlyDigits(raw);
  return isValidCpf(d) || isValidCnpj(d) ? d : null;
}
