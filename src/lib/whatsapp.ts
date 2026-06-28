/**
 * WhatsApp helpers (offline-friendly): build wa.me links and messages so the
 * operator can notify customers without any external integration. Pure parts
 * (phone normalization, message builders) are unit-tested.
 */

/** Normalize an Egyptian phone to wa.me digits (country code, no +/spaces). */
export function normalizePhone(phone?: string): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("20")) return digits;
  if (digits.startsWith("0") && digits.length >= 10) return `20${digits.slice(1)}`;
  return digits;
}

export function whatsappUrl(phone: string, message: string): string {
  return `https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(message)}`;
}

/** "Your car is ready" message. */
export function carReadyMessage(opts: {
  customerName?: string;
  vehicleLabel?: string;
  company: string;
}): string {
  const name = opts.customerName?.trim() ? ` ${opts.customerName.trim()}` : "";
  const car = opts.vehicleLabel?.trim() ? ` (${opts.vehicleLabel.trim()})` : "";
  return `أهلاً${name}، عربيتك${car} جاهزة للاستلام من ${opts.company}. شكراً لاختياركم! 🚗✨`;
}

/** Invoice summary message. Amounts are already formatted strings. */
export function invoiceSummaryMessage(opts: {
  company: string;
  invoiceNumber: string;
  total: string;
  remaining?: string;
}): string {
  const lines = [
    `🧾 ${opts.company}`,
    `فاتورة رقم: ${opts.invoiceNumber}`,
    `الإجمالي: ${opts.total}`,
  ];
  if (opts.remaining && opts.remaining.trim()) lines.push(`المتبقي: ${opts.remaining}`);
  lines.push("شكراً لزيارتكم!");
  return lines.join("\n");
}

/** Opens WhatsApp (web/app) for the phone+message. Returns false if no phone. */
export function openWhatsapp(phone: string | undefined, message: string): boolean {
  const normalized = normalizePhone(phone);
  if (!normalized) return false;
  window.open(whatsappUrl(normalized, message), "_blank", "noopener,noreferrer");
  return true;
}
