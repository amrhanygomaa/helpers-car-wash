import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { useAuth } from "../store/AuthContext";
import { formatCurrency, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";

export function QuotationPrintPage() {
  const { id } = useParams();
  const { quotations } = useInvoicing();
  const { settings } = useSettings();
  const { currentUser, auth } = useAuth();

  useEffect(() => {
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, []);

  if (!auth.isAuthenticated || !hasPermission(currentUser, "salesInvoices")) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        ليس لديك صلاحية
      </div>
    );
  }

  const quot = quotations.find((q) => q.id === id);
  if (!quot) {
    return (
      <div className="min-h-screen grid place-items-center text-sm text-slate-500">
        عرض السعر غير موجود
      </div>
    );
  }

  const subtotal = quot.lines.reduce((a, l) => a + l.subtotal, 0);
  const discount = quot.discount ?? 0;

  return (
    <div dir="rtl" className="min-h-screen bg-white p-8 font-sans text-slate-900 text-sm" style={{ fontFamily: "Arial, sans-serif" }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-8">
        <div>
          <div className="text-2xl font-bold">{settings.arabicLabels ? settings.companyNameAr : settings.companyName}</div>
          {settings.logoText && <div className="text-slate-500 text-xs mt-0.5">{settings.logoText}</div>}
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-blue-700">عرض سعر</div>
          <div className="text-slate-600 mt-0.5">رقم: {quot.quotationNumber}</div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-4 mb-6 text-sm border border-slate-200 rounded p-4">
        <div>
          <div className="text-slate-500 text-xs mb-0.5">العميل</div>
          <div className="font-semibold">{quot.customerName}</div>
        </div>
        <div>
          <div className="text-slate-500 text-xs mb-0.5">تاريخ الإصدار</div>
          <div>{formatDate(quot.date)}</div>
        </div>
        {quot.validUntil && (
          <div>
            <div className="text-slate-500 text-xs mb-0.5">صالح حتى</div>
            <div>{formatDate(quot.validUntil)}</div>
          </div>
        )}
      </div>

      {/* Lines table */}
      <table className="w-full border-collapse mb-6 text-sm">
        <thead>
          <tr className="bg-slate-100">
            <th className="border border-slate-200 p-2 text-right w-8">#</th>
            <th className="border border-slate-200 p-2 text-right">المنتج</th>
            <th className="border border-slate-200 p-2 text-center w-20">الوحدة</th>
            <th className="border border-slate-200 p-2 text-center w-20">الكمية</th>
            <th className="border border-slate-200 p-2 text-right w-32">سعر الوحدة</th>
            <th className="border border-slate-200 p-2 text-right w-32">الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {quot.lines.map((l, idx) => (
            <tr key={l.id}>
              <td className="border border-slate-200 p-2 text-center">{idx + 1}</td>
              <td className="border border-slate-200 p-2 font-medium">{l.productName}</td>
              <td className="border border-slate-200 p-2 text-center">{l.unit}</td>
              <td className="border border-slate-200 p-2 text-center">{l.quantity}</td>
              <td className="border border-slate-200 p-2 text-right font-mono">{formatCurrency(l.price, settings.currency)}</td>
              <td className="border border-slate-200 p-2 text-right font-mono">{formatCurrency(l.subtotal, settings.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totals */}
      <div className="flex justify-end">
        <table className="text-sm w-64">
          {discount > 0 && (
            <>
              <tbody>
                <tr>
                  <td className="py-1 text-slate-600">المجموع الفرعي</td>
                  <td className="py-1 text-right font-mono">{formatCurrency(subtotal, settings.currency)}</td>
                </tr>
                <tr className="text-rose-600">
                  <td className="py-1">خصم</td>
                  <td className="py-1 text-right font-mono">- {formatCurrency(discount, settings.currency)}</td>
                </tr>
              </tbody>
            </>
          )}
          <tbody>
            <tr className="font-bold text-base border-t border-slate-300">
              <td className="pt-2">الإجمالي</td>
              <td className="pt-2 text-right font-mono">{formatCurrency(quot.total, settings.currency)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Notes */}
      {quot.notes && (
        <div className="mt-6 border-t border-slate-200 pt-4">
          <div className="text-slate-500 text-xs mb-1">ملاحظات</div>
          <div className="text-sm text-slate-700">{quot.notes}</div>
        </div>
      )}

      {/* Footer */}
      {settings.invoiceFooter && (
        <div className="mt-8 border-t border-slate-200 pt-4 text-center text-slate-500 text-xs">
          {settings.invoiceFooter}
        </div>
      )}
    </div>
  );
}
