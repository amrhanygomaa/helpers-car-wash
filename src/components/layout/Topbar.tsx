import { useLocation, useNavigate } from "react-router-dom";
import { Search, Bell, ChevronDown, User, Lock, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import { useCatalog } from "../../store/CatalogContext";
import { useInvoicing } from "../../store/InvoicingContext";
import { useMemo, useState } from "react";
import { formatDate } from "../../lib/format";
import { hasPermission } from "../../lib/permissions";

// order matters: more specific paths must precede their prefixes (startsWith match)
const TITLES: Record<string, string> = {
  "/": "لوحة التحكم",
  "/products": "المنتجات",
  "/inventory": "المخزون",
  "/stocktakes": "الجرد الدوري",
  "/suppliers": "الموردين",
  "/customers": "العملاء",
  "/drivers": "السائقين",
  "/purchases": "فواتير المشتريات",
  "/sales": "فواتير المبيعات",
  "/quotations": "عروض الأسعار",
  "/returns": "المرتجعات",
  "/alerts": "التنبيهات",
  "/cashbox": "الخزينة",
  "/dues": "المستحقات",
  "/reports/employees": "تقرير الموظفين",
  "/reports": "التقارير",
  "/import": "استيراد البيانات",
  "/users": "المستخدمين",
  "/audit-log": "سجل التدقيق",
  "/my-profile": "ملفي الشخصي",
  "/settings": "الإعدادات",
};

export function Topbar({
  sidebarCollapsed,
  onToggleSidebar,
}: {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { auth, logout, lockSession, currentUser } = useAuth();
  const { settings } = useSettings();
  const { products, customers, suppliers } = useCatalog();
  const { purchaseInvoices, salesInvoices } = useInvoicing();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const alertCount = useMemo(() => {
    const outOfStock = products.filter((p) => p.quantity === 0).length;
    const overdueAccounts = salesInvoices.filter((inv) => {
      if (inv.paymentType !== "account" || inv.remaining <= 0 || inv.cancelled || !inv.paymentDueDate) return false;
      return new Date(inv.paymentDueDate) < new Date();
    }).length;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const overdueSuppliers = purchaseInvoices.filter((p) => p.remaining > 0 && new Date(p.date) < cutoff).length;
    return outOfStock + overdueAccounts + overdueSuppliers;
  }, [products, salesInvoices, purchaseInvoices]);

  const canSearchProducts = hasPermission(currentUser, "products");
  const canSearchCustomers = hasPermission(currentUser, "customers");
  const canSearchSuppliers = hasPermission(currentUser, "suppliers");
  const canSearchSales = hasPermission(currentUser, "salesInvoices");
  const canSearchPurchases = hasPermission(currentUser, "purchaseInvoices");
  const canViewAlerts = hasPermission(currentUser, "alerts");
  const accountName = currentUser?.name || auth.username || "مدير";

  const title = useMemo(() => {
    for (const key of Object.keys(TITLES)) {
      if (loc.pathname === key || loc.pathname.startsWith(key + "/")) return TITLES[key];
    }
    return "نظام المخزون";
  }, [loc.pathname]);

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [] as { label: string; sub: string; to: string }[];
    const out: { label: string; sub: string; to: string }[] = [];
    if (canSearchProducts) {
      products.forEach((p) => {
        if (
          p.name.toLowerCase().includes(term) ||
          p.code.toLowerCase().includes(term)
        )
          out.push({ label: p.name, sub: `منتج — ${p.code}`, to: "/products" });
      });
    }
    if (canSearchCustomers) {
      customers.forEach((c) => {
        if (c.name.toLowerCase().includes(term))
          out.push({ label: c.name, sub: "عميل", to: "/customers" });
      });
    }
    if (canSearchSuppliers) {
      suppliers.forEach((s) => {
        if (s.name.toLowerCase().includes(term))
          out.push({ label: s.name, sub: "مورد", to: "/suppliers" });
      });
    }
    if (canSearchSales) {
      salesInvoices.forEach((s) => {
        if (s.invoiceNumber.toLowerCase().includes(term))
          out.push({
            label: s.invoiceNumber,
            sub: `فاتورة مبيعات — ${s.customerName}`,
            to: `/sales/${s.id}`,
          });
      });
    }
    if (canSearchPurchases) {
      purchaseInvoices.forEach((p) => {
        if (p.invoiceNumber.toLowerCase().includes(term))
          out.push({
            label: p.invoiceNumber,
            sub: `فاتورة مشتريات — ${p.supplierName}`,
            to: `/purchases/${p.id}`,
          });
      });
    }
    return out.slice(0, 10);
  }, [
    q,
    products,
    customers,
    suppliers,
    salesInvoices,
    purchaseInvoices,
    canSearchProducts,
    canSearchCustomers,
    canSearchSuppliers,
    canSearchSales,
    canSearchPurchases,
  ]);

  return (
    <header className="sticky top-0 z-30 bg-white/90 backdrop-blur border-b border-slate-200 h-14 flex items-center gap-4 px-4">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "فتح القائمة" : "طي القائمة"}
          aria-label={sidebarCollapsed ? "فتح القائمة" : "طي القائمة"}
          className="w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 grid place-items-center transition-colors shrink-0"
        >
          {sidebarCollapsed ? (
            <PanelRightOpen className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
        <div className="text-sm text-slate-500">اليوم {formatDate(new Date().toISOString())}</div>
        <span className="text-slate-300">|</span>
        <h1 className="font-semibold text-slate-900 text-base truncate">{title}</h1>
      </div>
      <div className="flex-1 max-w-md relative">
        <div className="relative">
          <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="بحث سريع عن منتج، عميل، فاتورة..."
            className="w-full h-9 ps-3 pe-9 rounded-lg border border-slate-200 bg-slate-50 text-sm focus-ring"
          />
        </div>
        {q && results.length > 0 ? (
          <div className="absolute top-11 start-0 end-0 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden z-30">
            {results.map((r, idx) => (
              <button
                key={idx}
                onClick={() => {
                  navigate(r.to);
                  setQ("");
                }}
                className="w-full text-right px-3 py-2 hover:bg-slate-50 block border-b border-slate-100 last:border-0"
              >
                <div className="text-sm text-slate-900">{r.label}</div>
                <div className="text-xs text-slate-500">{r.sub}</div>
              </button>
            ))}
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-2 ms-auto">
        {canViewAlerts ? (
          <button
            onClick={() => navigate("/alerts")}
            className="relative w-9 h-9 rounded-lg hover:bg-slate-100 grid place-items-center text-slate-600"
          >
            <Bell className="w-4 h-4" />
            {alertCount > 0 && (
              alertCount < 10 ? (
                <span className="absolute -top-1 -end-1 min-w-[18px] h-[18px] rounded-full bg-red-500 text-white text-[10px] font-bold grid place-items-center px-1">
                  {alertCount}
                </span>
              ) : (
                <span className="absolute top-0.5 end-0.5 w-2.5 h-2.5 rounded-full bg-red-500" />
              )
            )}
          </button>
        ) : null}
        <div className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-2 px-2 h-9 rounded-lg hover:bg-slate-100"
          >
            <div className="w-7 h-7 rounded-full bg-brand-600 text-white grid place-items-center text-xs">
              <User className="w-3.5 h-3.5" />
            </div>
            <div className="text-sm text-slate-700">
              {accountName}
            </div>
            <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
          </button>
          {open ? (
            <div
              className="absolute top-11 end-0 bg-white border border-slate-200 rounded-lg shadow-lg w-48 py-1 z-30"
              onMouseLeave={() => setOpen(false)}
            >
              {currentUser?.role === "employee" ? (
                <button
                  className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    navigate("/my-profile");
                  }}
                >
                  ملفي الشخصي
                </button>
              ) : (
                <button
                  className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50"
                  onClick={() => {
                    setOpen(false);
                    navigate("/settings");
                  }}
                >
                  الإعدادات
                </button>
              )}
              {(settings.idleLockMinutes ?? 0) > 0 && (
                <button
                  className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                  onClick={() => {
                    setOpen(false);
                    lockSession();
                  }}
                >
                  <Lock className="w-3.5 h-3.5 text-slate-500" />
                  قفل الجلسة
                </button>
              )}
              <button
                className="w-full text-right px-3 py-2 text-sm hover:bg-slate-50 text-red-600"
                onClick={() => {
                  setOpen(false);
                  logout();
                }}
              >
                تسجيل الخروج
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
