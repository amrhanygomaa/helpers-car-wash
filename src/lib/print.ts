import type { QueueTicket, SalesInvoice } from "../types";

export async function printAppRoute(route: string): Promise<{ ok: boolean; error?: string }> {
  if (window.desktopAPI?.print) {
    return window.desktopAPI.print.route(route);
  }

  const url = `${window.location.origin}${window.location.pathname}#${route}`;
  const popup = window.open(url, "_blank");
  return popup ? { ok: true } : { ok: false, error: "popup_blocked" };
}

function escapeHtml(value: string | number | undefined): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function formatReceiptDate(iso?: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("ar-EG-u-nu-latn", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

function getBrandingSettings() {
  try {
    const raw = window.desktopAPI?.storage
      ? window.desktopAPI.storage.get("helpers_inventory_v1::settings")
      : localStorage.getItem("helpers_inventory_v1::settings");
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (e) {
    console.error("Failed to read branding settings", e);
  }
  return {
    companyName: "Top Gear",
    companyNameAr: "مغسلة توب جير",
    logoImage: "",
    logoText: "TG",
    arabicLabels: true,
  };
}

export async function printIntakeTicket({
  ticket,
  carsAhead,
  services,
}: {
  ticket: QueueTicket;
  carsAhead: number;
  services: string[];
}): Promise<{ ok: boolean; error?: string }> {
  if (window.desktopAPI?.print) {
    return window.desktopAPI.print.intakeTicket({ ticket, carsAhead, services });
  }

  if (typeof document === "undefined") return { ok: false, error: "document_unavailable" };

  const frame = document.createElement("iframe");
  frame.style.position = "fixed";
  frame.style.left = "0";
  frame.style.bottom = "0";
  frame.style.width = "1px";
  frame.style.height = "1px";
  frame.style.opacity = "0";
  frame.style.pointerEvents = "none";

  const branding = getBrandingSettings();
  const companyName = branding.arabicLabels ? (branding.companyNameAr || branding.companyName) : (branding.companyName || "Top Gear");
  const logoHtml = branding.logoImage
    ? `<img src="${escapeHtml(branding.logoImage)}" class="logo" alt="Logo" />`
    : `<div class="brand">${escapeHtml(companyName)}</div>`;

  const serviceRows = services.length
    ? services.map((name) => `<li>${escapeHtml(name)}</li>`).join("")
    : "<li>غير محدد</li>";

  frame.srcdoc = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تذكرة استقبال #${escapeHtml(ticket.number)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body {
      width: 72mm;
      margin: 0;
      color: #111827;
      font-family: Cairo, Tajawal, Tahoma, Arial, sans-serif;
      font-size: 11px;
      line-height: 1.55;
    }
    .center { text-align: center; }
    .brand { font-size: 16px; font-weight: 800; }
    .logo { max-height: 60px; max-width: 180px; object-fit: contain; margin: 0 auto 6px auto; display: block; }
    .muted { color: #4b5563; }
    .ticket { font-size: 32px; font-weight: 900; margin: 8px 0; }
    .row { display: flex; justify-content: space-between; gap: 8px; border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
    ul { margin: 4px 0 0; padding: 0 14px 0 0; }
    .footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #111827; }
  </style>
</head>
<body>
  <div class="center">
    ${logoHtml}
    <div class="ticket">#${escapeHtml(ticket.number)}</div>
  </div>
  <div class="row"><span>الاستلام المتوقع</span><strong>${escapeHtml(formatReceiptDate(ticket.requestedPickupAt) || "-")}</strong></div>
  <div class="row"><span>سيارات قبلك</span><strong>${escapeHtml(carsAhead)}</strong></div>
  <div>
    <strong>الخدمات</strong>
    <ul>${serviceRows}</ul>
  </div>
  ${ticket.note ? `<div class="footer"><strong>ملاحظة:</strong> ${escapeHtml(ticket.note)}</div>` : ""}
  ${
    (ticket.damageAreas && ticket.damageAreas.length) || ticket.conditionNotes
      ? `<div class="footer"><strong>حالة السيارة عند الاستلام:</strong><br/>${
          ticket.damageAreas && ticket.damageAreas.length
            ? `أماكن بها ملاحظات: ${ticket.damageAreas.map((a) => escapeHtml(a)).join("، ")}`
            : ""
        }${ticket.conditionNotes ? `<br/>${escapeHtml(ticket.conditionNotes)}` : ""}</div>`
      : ""
  }
  <div class="center footer muted">احتفظ بهذه التذكرة حتى الاستلام</div>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => {
        window.focus();
        window.print();
      }, 50);
    });
  </script>
</body>
</html>`;

  document.body.appendChild(frame);
  frame.addEventListener(
    "load",
    () => {
      const cleanup = () => {
        if (frame.parentNode) frame.remove();
      };
      frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 15000);
    },
    { once: true }
  );
  return { ok: true };
}

function fmtPrice(amount: number | undefined, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount ?? 0)} ${currency}`;
}

/**
 * Prints the final 80mm service invoice for a completed car-wash job.
 * Shows: all invoice lines (services + product add-ons), discount, total, payment.
 * Worker commission is internal-only and intentionally never printed.
 */
export function printServiceInvoice({
  invoice,
  businessName,
  currency,
}: {
  invoice: SalesInvoice;
  businessName: string;
  currency: string;
}): { ok: boolean; error?: string } {
  if (typeof document === "undefined") return { ok: false, error: "document_unavailable" };

  const documentTitle = invoice.invoiceKind === "product" ? "فاتورة منتجات" : "فاتورة غسيل سيارات";

  const lineRows = invoice.lines
    .map(
      (l) => `
      <tr>
        <td>${escapeHtml(l.productName)}</td>
        <td class="center">${escapeHtml(l.quantity)}</td>
        <td class="ltr">${fmtPrice(l.price, currency)}</td>
        <td class="ltr">${fmtPrice(l.subtotal ?? l.price * l.quantity, currency)}</td>
      </tr>`
    )
    .join("");

  const discountLabel = (() => {
    if (!invoice.discountCode) return "";
    const { discountCodeType: type, discountCodeValue: val } = invoice;
    if (type === "percent") return `خصم ${val}% (${escapeHtml(invoice.discountCode)})`;
    if (type === "override") return `سعر خاص (${escapeHtml(invoice.discountCode)})`;
    return `خصم ثابت (${escapeHtml(invoice.discountCode)})`;
  })();

  const subtotalForDisplay =
    invoice.discountCode != null
      ? invoice.lines.reduce((s, l) => s + (l.subtotal ?? l.price * l.quantity), 0)
      : null;

  const discountRow =
    discountLabel && subtotalForDisplay != null
      ? `<div class="row"><span>${escapeHtml(discountLabel)}</span><span class="ltr">(${fmtPrice(subtotalForDisplay - invoice.total, currency)})</span></div>`
      : "";

  const remaining = invoice.remaining ?? Math.max(0, invoice.total - invoice.amountReceived);
  // Preserve what the customer actually handed over (see cashTendered on the
  // type) so the receipt still shows "دفع كام" and the change given back —
  // amountReceived alone is capped at the total for accounting purposes.
  const cashTendered = invoice.cashTendered ?? 0;
  const changeGiven = cashTendered > invoice.total ? cashTendered - invoice.total : 0;
  const amountPaidForDisplay = cashTendered > 0 ? cashTendered : invoice.amountReceived;

  const paymentRow =
    invoice.paymentType === "account"
      ? `<div class="row"><span>آجل</span><span class="ltr">${fmtPrice(invoice.total, currency)}</span></div>`
      : `<div class="row"><span>مدفوع</span><span class="ltr">${fmtPrice(amountPaidForDisplay, currency)}</span></div>
         ${changeGiven > 0 ? `<div class="row change"><span>الباقي</span><span class="ltr">${fmtPrice(changeGiven, currency)}</span></div>` : ""}
         ${remaining > 0 ? `<div class="row warn"><span>متبقي</span><span class="ltr">${fmtPrice(remaining, currency)}</span></div>` : ""}`;

  const frame = document.createElement("iframe");
  frame.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0;pointer-events:none;";

  frame.srcdoc = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(documentTitle)} ${escapeHtml(invoice.invoiceNumber)}</title>
  <style>
    @page { size: 80mm auto; margin: 4mm; }
    * { box-sizing: border-box; }
    body { width: 72mm; margin: 0; font-family: Cairo, Tajawal, Tahoma, Arial, sans-serif; font-size: 11px; line-height: 1.5; color: #111827; }
    .center { text-align: center; }
    .ltr { direction: ltr; text-align: left; }
    .brand { font-size: 16px; font-weight: 800; }
    .inv-no { font-size: 22px; font-weight: 900; margin: 4px 0; }
    .muted { color: #4b5563; }
    .small { font-size: 10px; }
    .row { display: flex; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding: 3px 0; }
    .row.warn { color: #b45309; font-weight: 700; }
    .row.change { color: #047857; font-weight: 700; }
    .divider { border-top: 1px dashed #111827; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; font-size: 10px; }
    th { background: #f1f5f9; padding: 2px 4px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 2px 4px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .total-row { font-size: 13px; font-weight: 800; display: flex; justify-content: space-between; padding: 5px 0; }
    .footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #111827; text-align: center; }
  </style>
</head>
<body>
  <div class="center">
    <div class="brand">${escapeHtml(businessName || "Top Gear")}</div>
    <div class="muted">${escapeHtml(documentTitle)}</div>
    <div class="inv-no">#${escapeHtml(invoice.invoiceNumber)}</div>
    <div class="muted small">${escapeHtml(formatReceiptDate(invoice.finalizedAt ?? invoice.date))}</div>
  </div>
  <div class="divider"></div>
  <div class="row"><span>العميل</span><strong>${escapeHtml(invoice.customerName)}</strong></div>
  ${invoice.vehicleLabel ? `<div class="row"><span>السيارة</span><strong>${escapeHtml(invoice.vehicleLabel)}</strong></div>` : ""}
  <div class="divider"></div>
  <table>
    <thead>
      <tr><th>الخدمة</th><th>ك</th><th>سعر</th><th>إجمالي</th></tr>
    </thead>
    <tbody>${lineRows}</tbody>
  </table>
  <div class="divider"></div>
  ${subtotalForDisplay != null ? `<div class="row muted small"><span>المجموع قبل الخصم</span><span class="ltr">${fmtPrice(subtotalForDisplay, currency)}</span></div>` : ""}
  ${discountRow}
  <div class="total-row"><span>الإجمالي</span><span class="ltr">${fmtPrice(invoice.total, currency)}</span></div>
  <div class="divider"></div>
  ${paymentRow}
  ${invoice.notes ? `<div class="muted small" style="margin-top:4px">ملاحظة: ${escapeHtml(invoice.notes)}</div>` : ""}
  <div class="footer muted small">شكراً لاختياركم Top Gear — احتفظ بهذه الفاتورة</div>
  <script>
    window.addEventListener("load", () => {
      setTimeout(() => { window.focus(); window.print(); }, 50);
    });
  </script>
</body>
</html>`;

  document.body.appendChild(frame);
  frame.addEventListener(
    "load",
    () => {
      const cleanup = () => { if (frame.parentNode) frame.remove(); };
      frame.contentWindow?.addEventListener("afterprint", cleanup, { once: true });
      setTimeout(cleanup, 15000);
    },
    { once: true }
  );
  return { ok: true };
}
