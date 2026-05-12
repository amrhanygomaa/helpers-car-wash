import { useEffect } from "react";
import { useApp } from "../../store/AppContext";
import { formatCurrency, formatDate } from "../../lib/format";
import type { InvoiceLine } from "../../types";

interface Props {
  kind: "sales" | "purchase";
  invoiceNumber: string;
  date: string;
  partyLabel: string;
  partyName: string;
  driverName?: string;
  lines: InvoiceLine[];
  total: number;
  amountPaid: number;
  remaining: number;
  notes?: string;
  paymentLabel?: string;
}

export function InvoicePrintLayout(props: Props) {
  const { settings } = useApp();

  useEffect(() => {
    document.title = `${props.kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"} ${props.invoiceNumber}`;
  }, [props.invoiceNumber, props.kind]);

  return (
    <div
      className="min-h-screen bg-slate-50 p-6 print:p-0 print:bg-white"
      dir="rtl"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          @page { size: A4 landscape; margin: 10mm; }
          body { background: white; }
        }
      `}} />
      <div className="max-w-6xl mx-auto bg-white print-container shadow-card border border-slate-200 print:border-0 print:shadow-none rounded-xl p-8 print:p-0">
        {/* Top action bar — hidden on print */}
        <div className="no-print flex items-center justify-between mb-6">
          <button
            onClick={() => window.history.back()}
            className="text-sm text-slate-600 hover:text-slate-900"
          >
            ← رجوع
          </button>
          <button
            onClick={() => window.print()}
            className="h-10 px-4 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700"
          >
            طباعة
          </button>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-200 pb-6 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 grid place-items-center text-white font-bold text-lg overflow-hidden">
              {settings.logoImage ? (
                <img src={settings.logoImage} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                settings.logoText
              )}
            </div>
            <div>
              <div className="font-bold text-xl text-slate-900">
                {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {settings.companyName}
              </div>
            </div>
          </div>
          <div className="text-left">
            <div className="text-2xl font-bold text-slate-900">
              {props.kind === "sales" ? "فاتورة مبيعات" : "فاتورة مشتريات"}
            </div>
            <div className="text-sm text-slate-500 mt-1">
              رقم الفاتورة: <span className="font-mono font-bold tabular-nums text-slate-900">{props.invoiceNumber}</span>
            </div>
            <div className="text-sm text-slate-500 tabular-nums">
              التاريخ: {formatDate(props.date)}
            </div>
          </div>
        </div>

        {/* Party info */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="text-xs text-slate-500">{props.partyLabel}</div>
            <div className="font-semibold text-slate-900 mt-1">
              {props.partyName}
            </div>
          </div>
          <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
            <div className="text-xs text-slate-500">طريقة الدفع / السائق</div>
            <div className="font-semibold text-slate-900 mt-1">
              {props.paymentLabel ?? "—"}
              {props.driverName ? (
                <span className="text-slate-500 text-sm">
                  {" "}
                  • السائق: {props.driverName}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        {/* Lines */}
        <table className="w-full border-collapse text-sm mb-6">
          <thead>
            <tr className="bg-slate-100 text-slate-700">
              <th className="p-2 border border-slate-200 text-center w-10">#</th>
              <th className="p-2 border border-slate-200 text-right">الصنف</th>
              <th className="p-2 border border-slate-200 text-center w-20">الوحدة</th>
              <th className="p-2 border border-slate-200 text-center w-20">الكمية</th>
              <th className="p-2 border border-slate-200 text-center w-28">
                السعر
              </th>
              <th className="p-2 border border-slate-200 text-center w-28">
                الإجمالي
              </th>
            </tr>
          </thead>
          <tbody>
            {props.lines.map((l, idx) => (
              <tr key={l.id}>
                <td className="p-2 border border-slate-200 text-center">
                  {idx + 1}
                </td>
                <td className="p-2 border border-slate-200">
                  {l.productName}
                  {l.expiryDate ? (
                    <span className="text-xs text-slate-500 block">
                      صلاحية: {formatDate(l.expiryDate)}
                    </span>
                  ) : null}
                </td>
                <td className="p-2 border border-slate-200 text-center">{l.unit}</td>
                <td className="p-2 border border-slate-200 text-center tabular-nums">{l.quantity}</td>
                <td className="p-2 border border-slate-200 text-center tabular-nums font-mono">
                  {formatCurrency(l.price, settings.currency)}
                </td>
                <td className="p-2 border border-slate-200 text-center font-bold tabular-nums font-mono">
                  {formatCurrency(l.subtotal, settings.currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mb-6">
          <div className="w-80 space-y-1 text-sm">
            <Row label="الإجمالي" value={formatCurrency(props.total, settings.currency)} />
            <Row
              label={props.kind === "sales" ? "المبلغ المستلم" : "المبلغ المدفوع"}
              value={formatCurrency(props.amountPaid, settings.currency)}
            />
            <div className="pt-2 border-t border-slate-300 mt-2">
              <Row
                label="المتبقي"
                bold
                value={formatCurrency(props.remaining, settings.currency)}
              />
            </div>
          </div>
        </div>

        {props.notes ? (
          <div className="text-xs text-slate-600 border-t border-slate-200 pt-3 mb-4">
            <span className="font-medium">ملاحظات: </span>
            {props.notes}
          </div>
        ) : null}

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 text-center text-xs text-slate-500 whitespace-pre-line">
          {settings.invoiceFooter}
        </div>
        
        <div className="mt-16 grid grid-cols-2 gap-6 text-sm">
          <SignatureBlock label="توقيع المستلم" />
          <SignatureBlock label="توقيع المسؤول" />
        </div>

        {/* Developer Info */}
        <div className="mt-12 text-center text-[10px] text-slate-400 font-medium">
          برمجة وتطوير: م/ عمرو هاني — واتساب: 01118445625
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between py-1 ${
        bold ? "text-slate-900 font-bold text-lg" : "text-slate-700 font-medium"
      }`}
    >
      <span>{label}</span>
      <span className="tabular-nums font-mono">{value}</span>
    </div>
  );
}

function SignatureBlock({ label }: { label: string }) {
  return (
    <div>
      <div className="h-16 border-b border-slate-400" />
      <div className="text-xs text-slate-500 mt-1 text-center">{label}</div>
    </div>
  );
}
