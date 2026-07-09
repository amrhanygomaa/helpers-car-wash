import { useEffect } from "react";
import { useSettings } from "../../store/SettingsContext";
import { formatCurrency, formatDate } from "../../lib/format";
import type { InvoiceLine, PaymentLogEntry, ReturnLine } from "../../types";
import { PAYMENT_METHOD_LABELS } from "../../lib/format";
import "./InvoicePrintLayout.css";

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
  overpayment?: number;
  /** Car Wash: vehicle this service invoice was issued for. */
  vehicleLabel?: string;
}

export function InvoicePrintLayout(props: Props) {
  const { settings } = useSettings();

  useEffect(() => {
    const prev = document.title;
    document.title = `فاتورة غسيل ${props.invoiceNumber}`;
    return () => { document.title = prev; };
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
      <div className="ipl-page invoice-page mx-auto bg-white shadow-xl print:shadow-none">
        {/* Top accent bar */}
        <div className="ipl-accent-top" />

        {/* Page body with padding */}
        <div className="ipl-body">

          {/* ── HEADER ── */}
          <div className="ipl-header">
            {/* Company info */}
            <div className="ipl-company-row">
              <div className={`ipl-logo${settings.logoImage ? "" : " ipl-logo--gradient"}`}>
                {settings.logoImage
                  ? <img src={settings.logoImage} alt="Logo" />
                  : settings.logoText}
              </div>
              <div>
                <div className="ipl-company-name">
                  {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
                </div>
                {settings.companyNameAr && settings.companyName && settings.companyNameAr !== settings.companyName && (
                  <div className="ipl-company-name-en">{settings.companyName}</div>
                )}
              </div>
            </div>

            {/* Invoice identity */}
            <div className="ipl-identity">
              <div className="ipl-identity-title">
                {isSales ? "فاتورة مبيعات" : "فاتورة مشتريات"}
              </div>
              <div className="ipl-identity-meta">
                <div className="ipl-meta-row">
                  <span className="ipl-meta-label">رقم الفاتورة</span>
                  <span className="ipl-meta-number">{props.invoiceNumber}</span>
                </div>
                <div className="ipl-meta-row">
                  <span className="ipl-meta-label">التاريخ</span>
                  <span className="ipl-meta-date">{formatDate(props.date)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── INFO ROW ── */}
          <div className={`ipl-info-grid ${props.paymentDueDate ? "ipl-info-grid--4col" : "ipl-info-grid--3col"}`}>
            <InfoBox label={props.partyLabel} value={props.partyName} accent />
            <InfoBox label="طريقة الدفع" value={props.paymentLabel ?? "—"} sub={props.priceTypeLabel ? `نوع السعر: ${props.priceTypeLabel}` : undefined} />
            {props.paymentDueDate ? (
              <InfoBox label="تاريخ الاستحقاق" value={formatDate(props.paymentDueDate)} />
            ) : null}
            <InfoBox label="السائق" value={props.driverName ?? "—"} />
          </div>

          {/* ── VEHICLE (car wash service invoices) ── */}
          {props.vehicleLabel ? (
            <div className="ipl-vehicle-row">
              <InfoBox label="المركبة" value={props.vehicleLabel} accent />
            </div>
          ) : null}

          {/* ── ITEMS TABLE ── */}
          <div className="ipl-table-wrap">
            <table className="ipl-table">
              <thead>
                <tr>
                  <Th center colClass="ipl-col-seq">#</Th>
                  <Th>الصنف</Th>
                  <Th center colClass="ipl-col-unit">الوحدة</Th>
                  <Th center colClass="ipl-col-unit">الكمية</Th>
                  <Th center colClass="ipl-col-price">السعر</Th>
                  <Th center colClass="ipl-col-total">الإجمالي</Th>
                </tr>
              </thead>
              <tbody>
                {props.lines.map((l, idx) => (
                  <tr key={l.id} className={idx % 2 === 1 ? "ipl-row-odd" : "ipl-row-even"}>
                    <Td center muted>{idx + 1}</Td>
                    <Td>
                      <span className="ipl-td-name">{l.productName}</span>
                      {l.employeeName && (
                        <span className="ipl-td-employee">الفني: {l.employeeName}</span>
                      )}
                      {l.expiryDate && (
                        <span className="ipl-td-expiry">صلاحية: {formatDate(l.expiryDate)}</span>
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
                  <tr key={`e${i}`} className={(props.lines.length + i) % 2 === 1 ? "ipl-row-odd" : "ipl-row-even"}>
                    {[0,1,2,3,4,5].map(j => (
                      <td key={j} className="ipl-td-empty">&nbsp;</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* ── RETURNS ── */}
          {props.returns && props.returns.length > 0 && (
            <div className="ipl-returns">
              <div className="ipl-returns-title">المرتجعات</div>
              <table className="ipl-table ipl-table--small">
                <thead>
                  <tr>
                    <Th center colClass="ipl-col-seq">#</Th>
                    <Th>الصنف</Th>
                    <Th center colClass="ipl-col-unit">الوحدة</Th>
                    <Th center colClass="ipl-col-unit">الكمية</Th>
                    <Th center colClass="ipl-col-price">السعر</Th>
                    <Th center colClass="ipl-col-total">الإجمالي</Th>
                  </tr>
                </thead>
                <tbody>
                  {props.returns.flatMap((r) => r.lines).map((l, idx) => (
                    <tr key={l.id} className={idx % 2 === 1 ? "ipl-row-odd-return" : "ipl-row-even"}>
                      <Td center muted>{idx + 1}</Td>
                      <Td><span className="ipl-td-name">{l.productName}</span></Td>
                      <Td center muted>{l.unit}</Td>
                      <Td center bold>{l.quantity}</Td>
                      <Td center mono>{formatCurrency(l.price, settings.currency)}</Td>
                      <Td center mono bold>{formatCurrency(l.subtotal, settings.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="ipl-returns-footer">
                <div className="ipl-returns-total">
                  إجمالي المرتجع: {formatCurrency(props.returns.reduce((a, r) => a + r.total, 0), settings.currency)}
                </div>
              </div>
            </div>
          )}

          {/* ── TOTALS + SIGNATURES ── */}
          <div className="ipl-bottom-row">

            {/* Signature lines */}
            <div className="ipl-signatures">
              <SignatureLine label="توقيع المستلم" />
              <SignatureLine label="توقيع المسؤول" />
            </div>

            {/* Totals box */}
            <div className="ipl-totals">
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
              {props.paymentLog && props.paymentLog.length > 1
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
              {props.paymentLog && props.paymentLog.length > 1 && (
                <TotalRow
                  label={isSales ? "إجمالي ما تم استلامه" : "إجمالي ما تم سداده"}
                  value={formatCurrency(props.amountPaid, settings.currency)}
                  paid
                />
              )}
              <TotalRow
                label="المتبقي"
                value={props.remaining > 0 ? `- ${formatCurrency(props.remaining, settings.currency)}` : formatCurrency(props.remaining, settings.currency)}
                highlight
              />
            </div>
          </div>

          {/* Notes */}
          {props.notes && (
            <div className="ipl-notes">
              <span className="ipl-notes-label">ملاحظات: </span>
              {props.notes}
            </div>
          )}

          {/* Spacer pushes footer to bottom */}
          <div className="ipl-spacer" />

          {/* Footer */}
          <div className="ipl-footer">
            {settings.invoiceFooter && (
              <div className="ipl-footer-text">{settings.invoiceFooter}</div>
            )}
            <div className="ipl-footer-brand">هيلبيرز تكنولوجي</div>
          </div>
        </div>

        {/* Bottom accent bar */}
        <div className="ipl-accent-bottom" />
      </div>
    </div>
  );
}

/* ── Small helper components ── */

function InfoBox({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className={`ipl-infobox${accent ? " ipl-infobox--accent" : ""}`}>
      <div className="ipl-infobox-label">{label}</div>
      <div className="ipl-infobox-value">{value}</div>
      {sub && <div className="ipl-infobox-sub">{sub}</div>}
    </div>
  );
}

function Th({ children, center, colClass }: { children: React.ReactNode; center?: boolean; colClass?: string }) {
  return (
    <th className={["ipl-th", center ? "ipl-th--center" : "", colClass ?? ""].filter(Boolean).join(" ")}>
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
  const cls = [
    "ipl-td",
    center  ? "ipl-td--center" : "",
    muted   ? "ipl-td--muted"  : "",
    bold    ? "ipl-td--bold"   : "",
    mono    ? "ipl-td--mono"   : "",
    accent  ? "ipl-td--accent" : "",
  ].filter(Boolean).join(" ");
  return <td className={cls}>{children}</td>;
}

function TotalRow({ label, value, highlight, discount, deduction, paid }: { label: string; value: string; highlight?: boolean; discount?: boolean; deduction?: boolean; paid?: boolean }) {
  const rowCls = [
    "ipl-total-row",
    highlight  ? "ipl-total-row--highlight"  : "",
    paid       ? "ipl-total-row--paid"        : "",
    discount   ? "ipl-total-row--discount"    : "",
    deduction  ? "ipl-total-row--deduction"   : "",
  ].filter(Boolean).join(" ");

  return (
    <div className={rowCls}>
      <span className={highlight ? "ipl-total-label--large" : "ipl-total-label"}>{label}</span>
      <span className={highlight ? "ipl-total-value--large" : "ipl-total-value"}>{value}</span>
    </div>
  );
}

function SignatureLine({ label }: { label: string }) {
  return (
    <div className="ipl-signature">
      <div className="ipl-signature-line" />
      <div className="ipl-signature-label">{label}</div>
    </div>
  );
}
