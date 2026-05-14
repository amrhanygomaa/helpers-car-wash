import { useState } from "react";
import { useApp } from "../store/AppContext";
import { PageHeader } from "../components/layout/AppLayout";
import { Receipt, ShoppingBag } from "lucide-react";
import { formatCurrency, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";

export function ReturnsPage() {
  const { salesReturns, purchaseReturns, currentUser, settings } = useApp();
  
  const canViewSales = hasPermission(currentUser, "returns");
  const canViewPurchases = hasPermission(currentUser, "returns");
  
  const [tab, setTab] = useState<"sales" | "purchases">(canViewSales ? "sales" : "purchases");

  return (
    <>
      <PageHeader
        title="المرتجعات"
        description="سجل بجميع مرتجعات البيع والشراء"
      />
      
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-200">
          {canViewSales && (
            <button
              onClick={() => setTab("sales")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-medium text-sm transition-colors ${
                tab === "sales"
                  ? "border-b-2 border-brand-600 text-brand-700 bg-brand-50"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <Receipt className="w-4 h-4" /> مرتجعات مبيعات
            </button>
          )}
          {canViewPurchases && (
            <button
              onClick={() => setTab("purchases")}
              className={`flex-1 flex items-center justify-center gap-2 py-4 font-medium text-sm transition-colors ${
                tab === "purchases"
                  ? "border-b-2 border-brand-600 text-brand-700 bg-brand-50"
                  : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <ShoppingBag className="w-4 h-4" /> مرتجعات مشتريات
            </button>
          )}
        </div>
        
        {tab === "sales" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم المرتجع</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium">الفاتورة الأصلية</th>
                  <th className="px-4 py-3 font-medium">العميل</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                  <th className="px-4 py-3 font-medium">طريقة الرد</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salesReturns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                      لا توجد مرتجعات مبيعات
                    </td>
                  </tr>
                ) : (
                  salesReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-brand-700">{r.returnNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-slate-600">{r.originalInvoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-900">{r.customerName}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(r.total, settings.currency)}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.refundCash ? "رد نقدية" : "خصم من الرصيد"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        
        {tab === "purchases" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-right">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم المرتجع</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium">الفاتورة الأصلية</th>
                  <th className="px-4 py-3 font-medium">المورد</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {purchaseReturns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      لا توجد مرتجعات مشتريات
                    </td>
                  </tr>
                ) : (
                  purchaseReturns.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-brand-700">{r.returnNumber}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(r.date)}</td>
                      <td className="px-4 py-3 text-slate-600">{r.originalInvoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-900">{r.supplierName}</td>
                      <td className="px-4 py-3 font-bold text-slate-900">{formatCurrency(r.total, settings.currency)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
