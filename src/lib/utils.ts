import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const EGYPT_PLATE_NUMBER_REGEX = /^[ء-ي](?: [ء-ي]){1,2} [0-9]{3,4}$/;

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeEgyptPlateNumber(value: string): string {
  const trimmed = value.trim();
  const digitsNormalized = trimmed.replace(/[٠-٩]/g, (ch) =>
    String("٠١٢٣٤٥٦٧٨٩").indexOf(ch).toString()
  );
  const cleaned = digitsNormalized.replace(/[^ء-ي0-9 ]+/g, "");
  const collapsed = cleaned.replace(/\s+/g, " ").trim();
  const flattened = collapsed.replace(/ /g, "");
  const letters = (flattened.match(/[ء-ي]/g) ?? []).slice(0, 3);
  const digits = (flattened.match(/[0-9]/g) ?? []).slice(0, 4);

  if (letters.length > 0 && digits.length > 0) {
    return `${letters.join(" ")} ${digits.join("")}`.trim();
  }
  if (letters.length > 0) {
    return letters.join(" ");
  }
  if (digits.length > 0) {
    return digits.join("");
  }

  return collapsed;
}

export function isValidEgyptPlateNumber(value: string): boolean {
  return EGYPT_PLATE_NUMBER_REGEX.test(normalizeEgyptPlateNumber(value));
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}${Date.now()
    .toString(36)
    .slice(-4)}`;
}

/**
 * YYYY-MM-DD from the LOCAL calendar date. Never use
 * `toISOString().slice(0, 10)` for day stamps or range boundaries: it converts
 * to UTC first, so on UTC+ machines it returns yesterday near midnight and
 * shifts month/quarter boundaries by a day (BUG-04, report 09).
 */
import { businessDateInCairo } from "./dates";

export function localISODate(d: Date = new Date()): string {
  return businessDateInCairo(d);
}

export function todayISO(): string {
  return businessDateInCairo();
}

export function isToday(dateStr: string): boolean {
  return dateStr.slice(0, 10) === todayISO();
}

export function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function inRange(dateStr: string, from?: string, to?: string): boolean {
  const d = dateStr.slice(0, 10);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

/** Returns all YYYY-MM keys from the month containing `from` to the month containing `to`. */
export function getMonthsInRange(from: string, to: string): string[] {
  const months: string[] = [];
  const start = new Date(from.slice(0, 7) + "-01");
  const end = new Date(to.slice(0, 7) + "-01");
  for (const d = new Date(start); d <= end; d.setMonth(d.getMonth() + 1)) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return months;
}

export const MONTH_NAMES_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

export function monthLabel(yyyymm: string): string {
  const [y, m] = yyyymm.split("-").map(Number);
  return `${MONTH_NAMES_AR[m - 1]} ${y}`;
}
