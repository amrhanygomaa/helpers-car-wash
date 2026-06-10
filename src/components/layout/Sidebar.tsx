import { NavLink } from "react-router-dom";
import type { ComponentType } from "react";
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
  HandCoins,
  BarChart3,
  Settings,
  LogOut,
  ArrowLeftRight,
  Truck,
  UserRound,
  PanelRightClose,
  PanelRightOpen,
  Shield,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import type { UserPermissions } from "../../types";
import { hasPermission } from "../../lib/permissions";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission?: keyof UserPermissions;
  ownerOnly?: boolean;
  employeeOnly?: boolean;
};

const NAV: NavItem[] = [
  { to: "/", label: "لوحة التحكم", icon: LayoutDashboard },
  { to: "/products", label: "المنتجات", icon: Package, permission: "products" },
  { to: "/inventory", label: "المخزون", icon: Warehouse, permission: "inventory" },
  { to: "/suppliers", label: "الموردين", icon: Factory, permission: "suppliers" },
  { to: "/customers", label: "العملاء", icon: Users, permission: "customers" },
  { to: "/purchases", label: "فواتير المشتريات", icon: ShoppingBag, permission: "purchaseInvoices" },
  { to: "/sales", label: "فواتير المبيعات", icon: Receipt, permission: "salesInvoices" },
  { to: "/drivers", label: "السائقين", icon: Truck, permission: "drivers" },
  { to: "/returns", label: "المرتجعات", icon: ArrowLeftRight, permission: "returns" },
  { to: "/alerts", label: "التنبيهات", icon: Bell, permission: "alerts" },
  { to: "/cashbox", label: "الخزينة", icon: Wallet, permission: "cashbox" },
  { to: "/dues", label: "المستحقات", icon: HandCoins, permission: "reports" },
  { to: "/reports", label: "التقارير", icon: BarChart3, permission: "reports" },
  { to: "/reports/employees", label: "تقرير الموظفين", icon: Users, ownerOnly: true },
  { to: "/users", label: "المستخدمين", icon: Users, ownerOnly: true },
  { to: "/audit-log", label: "سجل التدقيق", icon: Shield, ownerOnly: true },
  { to: "/my-profile", label: "ملفي الشخصي", icon: UserRound, employeeOnly: true },
  { to: "/settings", label: "الإعدادات", icon: Settings, ownerOnly: true },
];

export function Sidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const { logout, currentUser } = useAuth();
  const { settings } = useSettings();
  
  const filteredNav = NAV.filter(item => {
    if (!currentUser) return false;
    if (currentUser.role === "owner") {
      return !item.employeeOnly;
    }
    if (item.ownerOnly) return false;
    if (item.employeeOnly && currentUser.role !== "employee") return false;
    if (item.permission && !hasPermission(currentUser, item.permission)) return false;
    return true;
  });
  
  return (
    <aside
      className={cn(
        "shrink-0 bg-white border-e border-slate-200 flex flex-col h-screen sticky top-0 transition-[width] duration-200",
        collapsed ? "w-20" : "w-60"
      )}
    >
      <div
        className={cn(
          "border-b border-slate-100 flex items-center gap-3",
          collapsed ? "p-3 justify-center flex-col" : "p-4"
        )}
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-brand-600 to-brand-800 grid place-items-center text-white font-bold overflow-hidden shrink-0">
          {settings.logoImage ? (
            <img src={settings.logoImage} alt="Logo" className="w-full h-full object-cover" />
          ) : (
            settings.logoText || "HD"
          )}
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <div className="font-semibold text-slate-900 truncate text-sm">
            {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
          </div>
          <div className="text-[11px] text-slate-500">نظام المخزون والمبيعات</div>
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          title={collapsed ? "فتح القائمة" : "طي القائمة"}
          aria-label={collapsed ? "فتح القائمة" : "طي القائمة"}
          className={cn(
            "w-9 h-9 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 grid place-items-center transition-colors",
            collapsed ? "mt-1" : "ms-auto"
          )}
        >
          {collapsed ? (
            <PanelRightOpen className="w-4 h-4" />
          ) : (
            <PanelRightClose className="w-4 h-4" />
          )}
        </button>
      </div>
      <nav className={cn("p-2 flex-1 overflow-y-auto", collapsed && "space-y-1")}>
        {filteredNav.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/" || item.to === "/reports"}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "flex items-center h-10 rounded-lg text-sm transition-colors",
                  collapsed ? "justify-center px-0" : "gap-3 px-3",
                  isActive
                    ? "bg-brand-50 text-brand-700 font-medium"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className={cn(collapsed && "sr-only")}>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <button
          onClick={logout}
          title={collapsed ? "تسجيل الخروج" : undefined}
          className={cn(
            "w-full flex items-center h-10 rounded-lg text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900",
            collapsed ? "justify-center px-0" : "gap-3 px-3"
          )}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span className={cn(collapsed && "sr-only")}>تسجيل الخروج</span>
        </button>
      </div>
    </aside>
  );
}
