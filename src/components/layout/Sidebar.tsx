import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Factory,
  Users,
  ShoppingBag,
  Receipt,
  Bell,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeftRight,
  Truck,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useApp } from "../../store/AppContext";

const NAV = [
  { to: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/products", label: "المنتجات", icon: Package, permission: "products" },
  { to: "/inventory", label: "المخزون", icon: Warehouse, permission: "products" },
  { to: "/suppliers", label: "الموردين", icon: Factory, permission: "suppliers" },
  { to: "/customers", label: "العملاء", icon: Users, permission: "customers" },
  { to: "/purchases", label: "فواتير المشتريات", icon: ShoppingBag, permission: "purchaseInvoices" },
  { to: "/sales", label: "فواتير المبيعات", icon: Receipt, permission: "salesInvoices" },
  { to: "/drivers", label: "السائقين", icon: Truck, permission: "salesInvoices" },
  { to: "/returns", label: "المرتجعات", icon: ArrowLeftRight },
  { to: "/alerts", label: "التنبيهات", icon: Bell, permission: "products" },
  { to: "/cashbox", label: "الخزينة", icon: Wallet, permission: "cashbox" },
  { to: "/reports", label: "التقارير", icon: BarChart3, permission: "reports" },
  { to: "/users", label: "المستخدمين", icon: Users, ownerOnly: true },
  { to: "/settings", label: "الإعدادات", icon: Settings, ownerOnly: true },
];

export function Sidebar() {
  const { settings, logout, currentUser } = useApp();
  
  const filteredNav = NAV.filter(item => {
    if (!currentUser) return false;
    if (currentUser.role === "owner") return true;
    if (item.ownerOnly) return false;
    if (item.to === "/returns") {
      return currentUser.permissions.salesInvoices?.view || currentUser.permissions.purchaseInvoices?.view;
    }
    // @ts-ignore - dynamic permission check
    if (item.permission && !currentUser.permissions[item.permission]?.view) return false;
    return true;
  });
  
  return (
    <aside className="w-60 shrink-0 bg-white border-e border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-100 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 grid place-items-center text-white font-bold overflow-hidden">
          {settings.logoImage ? (
            <img src={settings.logoImage} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            settings.logoText || "HD"
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-slate-900 truncate text-sm">
            {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
          </div>
          <div className="text-[11px] text-slate-500">نظام المخزون والمبيعات</div>
        </div>
      </div>
      <nav className="p-2 flex-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-3 px-3 h-10 rounded-lg text-sm transition-colors",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )
              }
            >
              <Icon className="w-4 h-4" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 h-10 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900"
        >
          <LogOut className="w-4 h-4" />
          <span>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
