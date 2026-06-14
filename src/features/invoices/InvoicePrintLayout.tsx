import { useEffect } from "react";
import { useSettings } from "../../store/SettingsContext";
import { formatCurrency, formatDate } from "../../lib/format";
import type { InvoiceLine, PaymentLogEntry, ReturnLine } from "../../types";
import { PAYMENT_METHOD_LABELS } from "../../lib/format";

interface Props {
  kind: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  partyLabel: string;
  partyName: string;
  driverName?: string;
  lines: InvoiceLine[];
  total: number;
  discount?: number;
  amountPaid: number;
  remaining: number;
  notes?: string;
  paymentLabel?: string;
  priceTypeLabel?: string;
  // Accepts both SalesReturn and PurchaseReturn (purchase returns have no refundCash).
  returns?: Array<{ lines: ReturnLine[]; total: number; refundCash?: boolean }>;
  paymentDueDate?: string;
  customerBalance?: number;
  customerName?: string;
  paymentLog?: PaymentLogEntry[];
}

export function InvoicePrintLayout(props: Props) {
  const { settings } = useSettings();

  useEffect(() => {
    document.title = `${props.kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"} ${props.invoiceNumber}`;
  }, [props.invoiceNumber, props.kind]);

  const isSales = props.kind === "sales";
  const returnsTotal = (props.returns ?? []).reduce((a, r) => a + r.total, 0);

  return (
    <div className="min-h-screen bg-slate-200 py-8 px-4 print:p-0 print:bg-white" dir="rtl">
      <style dangerouslySetInnerHTML={{
        __html: `
          @media print {
            @page { size: A4 portrait; margin: 0; }
            body { background: white; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .no-print { display: none !important; }
            .invoice-page { box-shadow: none !important; border-radius: 0 !important; }
          }
          @media screen {
            .invoice-page { max-width: 210mm; }
          }
        `
      }} />

      {/* Screen toolbar */}
      <div className="no-print max-w-[210mm] mx-auto flex items-center justify-between mb-4">
        <button
          onClick={() => window.history.back()}
          className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-3 h-9"
        >
          ← رجوع
        </button>
        <button
          onClick={() => window.print()}
          className="h-9 px-6 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700"
        >
          طباعة
        </button>
      </div>

      {/* A4 page */}
      <div
        className="invoice-page mx-auto bg-white shadow-xl print:shadow-none"
        style={{ minHeight: "297mm", display: "flex", flexDirection: "column" }}
      >
        {/* Top accent bar */}
        <div style={{ height: 8, background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)" }} />

        {/* Page body with padding */}
        <div style={{ padding: "20mm 16mm 14mm", display: "flex", flexDirection: "column", flex: 1 }}>

          {/* ── HEADER ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, paddingBottom: 14, borderBottom: "2px solid #1e3a5f" }}>
            {/* Company info */}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 52, height: 52, borderRadius: 10, overflow: "hidden", flexShrink: 0,
                background: settings.logoImage ? "transparent" : "linear-gradient(135deg, #1e3a5f 0%, #2563eb 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "white", fontWeight: 700, fontSize: 16
              }}>
                {settings.logoImage
                  ? <img src={settings.logoImage} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
                  : settings.logoText}
              </div>
              <div>
                <div style={{ fontWeight: 800, fontSize: 18, color: "#0f172a", lineHeight: 1.2 }}>
                  {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
                </div>
                {settings.companyNameAr && settings.companyName && settings.companyNameAr !== settings.companyName && (
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{settings.companyName}</div>
                )}
              </div>
            </div>

            {/* Invoice identity */}
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#1e3a5f", letterSpacing: -0.5 }}>
                {isSales ? "فاتورة مبيعات" : "فاتورة مشتريات"}
              </div>
              <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>رقم الفاتورة</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", fontFamily: "monospace", background: "#f1f5f9", padding: "1px 8px", borderRadius: 4 }}>
                    {props.invoiceNumber}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
                  <span style={{ fontSize: 11, color: "#64748b" }}>التاريخ</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: "#334155" }}>{formatDate(props.date)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── INFO ROW ── */}
          <div style={{ display: "grid", gridTemplateColumns: props.paymentDueDate ? "1fr 1fr 1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
            <InfoBox label={props.partyLabel} value={props.partyName} accent />
            <InfoBox label="طريقة الدفع" value={props.paymentLabel ?? "—"} sub={props.priceTypeLabel ? `نوع السعر: ${props.priceTypeLabel}` : undefined} />
            {props.paymentDueDate ? (
              <InfoBox label="تاريخ الاستحقاق" value={formatDate(props.paymentDueDate)} />
            ) : null}
            <InfoBox label="السائق" value={props.driverName ?? "—"} />
          </div>

          {/* ── ITEMS TABLE ── */}
          <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  <Th center style={{ width: 28 }}>#</Th>
                  <Th>الصنف</Th>
                  <Th center style={{ width: 52 }}>الوحدة</Th>
                  <Th center style={{ width: 52 }}>الكمية</Th>
                  <Th center style={{ width: 80 }}>السعر</Th>
                  <Th center style={{ width: 88 }}>الإجمالي</Th>
                </tr>
              </thead>
              <tbody>
                {props.lines.map((l, idx) => (
                  <tr key={l.id} style={{ background: idx % 2 === 1 ? "#f8fafc" : "#ffffff" }}>
                    <Td center muted>{idx + 1}</Td>
                    <Td>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>{l.productName}</span>
                      {l.expiryDate && (
                        <span style={{ display: "block", fontSize: 10, color: "#94a3b8" }}>
                          صلاحية: {formatDate(l.expiryDate)}
                        </span>
                      )}
                    </Td>
                    <Td center muted>{l.unit}</Td>
                    <Td center bold>{l.quantity}</Td>
                    <Td center mono>{formatCurrency(l.price, settings.currency)}</Td>
                    <Td center mono bold accent>{formatCurrency(l.subtotal, settings.currency)}</Td>
                  </tr>
                ))}
                {/* Filler rows — minimum 8 rows total to fill space */}
                {Array.from({ length: Math.max(0, 8 - props.lines.length) }).map((_, i) => (
                  <tr key={`e${i}`} style={{ background: (props.lines.length + i) % 2 === 1 ? "#f8fafc" : "#ffffff" }}>
                    {[0,1,2,3,4,5].map(j => (
                      <td key={j} style={{ padding: "9px 6px", border: "1px solid #e2e8f0" }}>&nbsp;</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── RETURNS ── */}
          {props.returns && props.returns.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", marginBottom: 6, borderBottom: "1.5px solid #dc2626", paddingBottom: 4 }}>
                المرتجعات
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <Th center style={{ width: 28 }}>#</Th>
                    <Th>الصنف</Th>
                    <Th center style={{ width: 52 }}>الوحدة</Th>
                    <Th center style={{ width: 52 }}>الكمية</Th>
                    <Th center style={{ width: 80 }}>السعر</Th>
                    <Th center style={{ width: 88 }}>الإجمالي</Th>
                  </tr>
                </thead>
                <tbody>
                  {props.returns.flatMap((r) => r.lines).map((l, idx) => (
                    <tr key={l.id} style={{ background: idx % 2 === 1 ? "#fff5f5" : "#ffffff" }}>
                      <Td center muted>{idx + 1}</Td>
                      <Td><span style={{ fontWeight: 600, color: "#0f172a" }}>{l.productName}</span></Td>
                      <Td center muted>{l.unit}</Td>
                      <Td center bold>{l.quantity}</Td>
                      <Td center mono>{formatCurrency(l.price, settings.currency)}</Td>
                      <Td center mono bold>{formatCurrency(l.subtotal, settings.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#dc2626", background: "#fff5f5", border: "1px solid #fecaca", borderRadius: 6, padding: "4px 12px" }}>
                  إجمالي المرتجع: {formatCurrency(props.returns.reduce((a, r) => a + r.total, 0), settings.currency)}
                </div>
              </div>
            </div>
          )}

          {/* ── PAYMENT LOG (purchase only) ── */}
          {!isSales && props.paymentLog && props.paymentLog.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#1e3a5f", marginBottom: 6, borderBottom: "1.5px solid #1e3a5f", paddingBottom: 4 }}>
                سجل سداد الدفعات
              </div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr>
                    <Th center style={{ width: 28 }}>#</Th>
                    <Th center style={{ width: 90 }}>التاريخ</Th>
                    <Th center style={{ width: 100 }}>وسيلة الدفع</Th>
                    <Th center style={{ width: 110 }}>المبلغ المسدد</Th>
                    <Th>ملاحظات</Th>
                  </tr>
                </thead>
                <tbody>
                  {props.paymentLog.map((entry, idx) => (
                    <tr key={entry.id} style={{ background: idx % 2 === 1 ? "#f0f7ff" : "#ffffff" }}>
                      <Td center muted>{idx + 1}</Td>
                      <Td center>{formatDate(entry.date)}</Td>
                      <Td center>{PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod}</Td>
                      <Td center mono bold accent>{formatCurrency(entry.amount, settings.currency)}</Td>
                      <Td muted>{entry.notes ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── TOTALS + SIGNATURES ── */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14 }}>

            {/* Signature lines */}
            <div style={{ display: "flex", gap: 32, fontSize: 11, color: "#64748b" }}>
              <SignatureLine label="توقيع المستلم" />
              <SignatureLine label="توقيع المسؤول" />
            </div>

            {/* Totals box */}
            <div style={{ width: 220, border: "1px solid #cbd5e1", borderRadius: 8, overflow: "hidden" }}>
              {props.discount ? (
                <>
                  <TotalRow label="الإجمالي قبل الخصم" value={formatCurrency(props.total + props.discount, settings.currency)} />
                  <TotalRow label="خصم" value={`- ${formatCurrency(props.discount, settings.currency)}`} discount />
                  <TotalRow label="صافي الفاتورة" value={formatCurrency(props.total, settings.currency)} />
                </>
              ) : (
                <TotalRow label="الإجمالي" value={formatCurrency(props.total, settings.currency)} />
              )}
              {returnsTotal > 0 && (
                <>
                  <TotalRow
                    label={`المرتجع ${(props.returns ?? []).some(r => r.refundCash) ? "(رد نقدي)" : "(مخصوم من الرصيد)"}`}
                    value={`- ${formatCurrency(returnsTotal, settings.currency)}`}
                    deduction
                  />
                  <TotalRow
                    label="صافي بعد المرتجع"
                    value={formatCurrency(Math.max(0, props.total - returnsTotal), settings.currency)}
                  />
                </>
              )}
              {!isSales && props.paymentLog && props.paymentLog.length > 1
                ? props.paymentLog.map((entry, i) => (
                    <TotalRow
                      key={entry.id}
                      label={`دفعة ${i + 1} (${PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod})`}
                      value={formatCurrency(entry.amount, settings.currency)}
                      paid
                    />
                  ))
                : (
                  <TotalRow
                    label={isSales ? "تم استلام" : "تم سداد"}
                    value={formatCurrency(props.amountPaid, settings.currency)}
                    paid
                  />
                )
              }
              {!isSales && props.paymentLog && props.paymentLog.length > 1 && (
                <TotalRow
                  label="إجمالي ما تم سداده"
                  value={formatCurrency(props.amountPaid, settings.currency)}
                  paid
                />
              )}
              <TotalRow
                label="المتبقي"
                value={props.remaining > 0 ? `- ${formatCurrency(props.remaining, settings.currency)}` : formatCurrency(props.remaining, settings.currency)}
                highlight
              />
              {isSales && props.customerBalance !== undefined && props.customerName ? (
                <TotalRow
                  label={`رصيد ${props.customerName}`}
                  value={
                    props.customerBalance > 0
                      ? `- ${formatCurrency(props.customerBalance, settings.currency)}`
                      : props.customerBalance < 0
                        ? `دائن: ${formatCurrency(-props.customerBalance, settings.currency)}`
                        : "لا يوجد مستحق"
                  }
                  deduction={props.customerBalance > 0}
                />
              ) : null}
            </div>
          </div>

          {/* Notes */}
          {props.notes && (
            <div style={{ marginTop: 12, padding: "8px 10px", background: "#fefce8", border: "1px solid #fde68a", borderRadius: 6, fontSize: 11, color: "#78350f" }}>
              <span style={{ fontWeight: 700 }}>ملاحظات: </span>
              {props.notes}
            </div>
          )}

          {/* Spacer pushes footer to bottom */}
          <div style={{ flex: 1 }} />

          {/* Footer */}
          <div style={{ marginTop: 20, paddingTop: 10, borderTop: "1px solid #e2e8f0" }}>
            {settings.invoiceFooter && (
              <div style={{ textAlign: "center", fontSize: 11, color: "#64748b", whiteSpace: "pre-line", marginBottom: 8 }}>
                {settings.invoiceFooter}
              </div>
            )}
            <div style={{ textAlign: "center", fontSize: 9, color: "#cbd5e1", marginTop: 4 }}>
              هيلبيرز تكنولوجي
            </div>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div style={{ height: 5, background: "linear-gradient(90deg, #1e3a5f 0%, #2563eb 100%)" }} />
      </div>
    </div>
  );
}

/* ── Small helper components ── */

function InfoBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${accent ? "#bfdbfe" : "#e2e8f0"}`,
      borderRadius: 8,
      padding: "8px 10px",
      background: accent ? "#eff6ff" : "#f8fafc",
      borderRight: accent ? "3px solid #2563eb" : undefined,
    }}>
      <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 3, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: "#64748b", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Th({ children, center, style }: { children: React.ReactNode; center?: boolean; style?: React.CSSProperties }) {
  return (
    <th style={{
      padding: "8px 6px",
      border: "1px solid #1e3a5f",
      background: "#1e3a5f",
      color: "white",
      fontWeight: 700,
      fontSize: 11,
      textAlign: center ? "center" : "right",
      ...style,
    }}>
      {children}
    </th>
  );
}

function Td({ children, center, muted, bold, mono, accent }: {
  children: React.ReactNode;
  center?: boolean;
  muted?: boolean;
  bold?: boolean;
  mono?: boolean;
  accent?: boolean;
}) {
  return (
    <td style={{
      padding: "8px 6px",
      border: "1px solid #e2e8f0",
      textAlign: center ? "center" : "right",
      color: accent ? "#1e3a5f" : muted ? "#64748b" : "#0f172a",
      fontWeight: bold ? 700 : 400,
      fontFamily: mono ? "monospace" : undefined,
    }}>
      {children}
    </td>
  );
}

function TotalRow({ label, value, highlight, discount, deduction, paid }: { label: string; value: string; highlight?: boolean; discount?: boolean; deduction?: boolean; paid?: boolean }) {
  const bgColor = highlight
    ? "#1e3a5f"
    : paid
    ? "#f0fdf4"
    : discount
    ? "#f0fdf4"
    : deduction
    ? "#fef2f2"
    : "#f8fafc";

  const textColor = highlight
    ? "white"
    : paid
    ? "#15803d"
    : discount
    ? "#16a34a"
    : deduction
    ? "#dc2626"
    : "#334155";

  return (
    <div style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: highlight ? "10px 12px" : "7px 12px",
      background: bgColor,
      borderBottom: highlight ? "none" : "1px solid #e2e8f0",
      color: textColor,
    }}>
      <span style={{ fontSize: highlight ? 13 : 12, fontWeight: highlight ? 700 : 500 }}>{label}</span>
      <span style={{ fontSize: highlight ? 14 : 12, fontWeight: 700, fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ width: 110, height: 36, borderBottom: "1.5px solid #94a3b8", marginBottom: 4 }} />
      <div style={{ fontSize: 10, color: "#64748b" }}>{label}</div>
    </div>
  );
}
