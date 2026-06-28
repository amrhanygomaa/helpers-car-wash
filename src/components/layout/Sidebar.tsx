import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import type { ComponentType } from "react";
import {
  LayoutDashboard,
  Package,
  Warehouse,
  Users,
  Receipt,
  Wallet,
  BarChart3,
  Settings,
  LogOut,
  UserRound,
  Shield,
  ClipboardList,
  ChevronDown,
  Car,
  ListChecks,
  Sparkles,
  MessageCircle,
  Building2,
  BadgeCheck,
  DoorClosed,
  CalendarDays,
  UserCheck,
} from "lucide-react";
import { cn } from "../../lib/utils";
import { lsGet, lsSet } from "../../lib/storage";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import type { AppUser, UserPermissions } from "../../types";
import { hasPermission, hasPermissionKey, type PermissionKey } from "../../lib/permissions";
import { useFeatures } from "../../lib/useFeatures";
import type { FeatureKey } from "../../lib/features";

type NavItem = {
  to: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  permission?: keyof UserPermissions;
  permissionKey?: PermissionKey;
  feature?: FeatureKey;
  ownerOnly?: boolean;
  employeeOnly?: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  items: NavItem[];
};

const TOP_ITEMS: NavItem[] = [
  { to: "/", label: "لوحة التحكم", icon: LayoutDashboard },
];

const GROUPS: NavGroup[] = [
  {
    id: "carwash",
    label: "غسيل السيارات",
    items: [
      { to: "/queue", label: "طابور الغسيل", icon: ListChecks, permission: "queue", feature: "carwashQueue" },
      { to: "/carwash/new", label: "فاتورة غسيل جديدة", icon: Receipt, permission: "salesInvoices", feature: "washServices" },
      { to: "/vehicles", label: "المركبات", icon: Car, permission: "vehicles", feature: "vehicles" },
      { to: "/services", label: "خدمات الغسيل", icon: Sparkles, permission: "washServices", feature: "washServices" },
      { to: "/carwash/products", label: "إضافات الغسيل", icon: Package, permissionKey: "products.view", feature: "washServices" },
      { to: "/carwash/materials", label: "خامات الغسيل", icon: Warehouse, permissionKey: "materials.view", feature: "washServices" },
      { to: "/carwash/packages", label: "الاشتراكات والباقات", icon: BadgeCheck, permissionKey: "products.view", feature: "washServices" },
      { to: "/carwash/reports", label: "تقارير الغسيل", icon: BarChart3, permission: "reports", feature: "washServices" },
    ],
  },
  {
    id: "invoices",
    label: "الفواتير",
    items: [
      { to: "/sales", label: "فواتير الغسيل", icon: Receipt, permission: "salesInvoices", feature: "salesInvoices" },
    ],
  },
  {
    id: "parties",
    label: "العملاء والتسويق",
    items: [
      { to: "/customers", label: "العملاء", icon: Users, permission: "customers", feature: "customers" },
      { to: "/customers/marketing", label: "تسويق العملاء", icon: MessageCircle, permission: "customers", feature: "customers" },
    ],
  },
  {
    id: "finance",
    label: "المالية والتقارير",
    items: [
      { to: "/cashbox", label: "الخزينة", icon: Wallet, permission: "cashbox", feature: "cashbox" },
      { to: "/cashbox/shift", label: "وردية الخزنة", icon: DoorClosed, permission: "cashbox", feature: "cashbox" },
      { to: "/workers/attendance", label: "حضور الصنايعية", icon: UserCheck, permissionKey: "payroll.manage" },
      { to: "/payroll/day-close", label: "قفلة اليوم", icon: ClipboardList, permissionKey: "payroll.manage" },
      { to: "/reports/end-of-day", label: "تقرير نهاية اليوم", icon: CalendarDays, permission: "reports", feature: "reports" },
      { to: "/reports/employees", label: "تقرير الموظفين", icon: Users, permissionKey: "payroll.manage", feature: "employeesReport" },
    ],
  },
  {
    id: "admin",
    label: "الإدارة",
    items: [
      { to: "/users", label: "المستخدمين", icon: Users, ownerOnly: true },
      { to: "/audit-log", label: "سجل التدقيق", icon: Shield, ownerOnly: true },
      { to: "/branches", label: "الفروع", icon: Building2, permissionKey: "settings.manage" },
      { to: "/settings", label: "الإعدادات", icon: Settings, permissionKey: "settings.manage" },
    ],
  },
];

const BOTTOM_ITEMS: NavItem[] = [
  { to: "/my-profile", label: "ملفي الشخصي", icon: UserRound, employeeOnly: true },
];

function canSee(
  item: NavItem,
  user: AppUser | null,
  isFeatureOn: (key: FeatureKey) => boolean
): boolean {
  if (!user) return false;
  if (item.feature && !isFeatureOn(item.feature)) return false;
  if (user.role === "owner") return !item.employeeOnly;
  if (item.ownerOnly) return false;
  if (item.permissionKey && !hasPermissionKey(user, item.permissionKey)) return false;
  if (item.permission && !hasPermission(user, item.permission)) return false;
  return true;
}

function itemMatchesPath(item: NavItem, pathname: string): boolean {
  if (item.to === "/") return pathname === "/";
  return pathname === item.to || pathname.startsWith(item.to + "/");
}

export function Sidebar({ collapsed }: { collapsed: boolean }) {
  const { logout, currentUser } = useAuth();
  const { settings } = useSettings();
  const { isEnabled } = useFeatures();
  const { pathname } = useLocation();

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    lsGet("sidebarOpenGroups", {})
  );
  useEffect(() => {
    lsSet("sidebarOpenGroups", openGroups);
  }, [openGroups]);

  // Keep the group that contains the current page open so the active item is
  // never hidden behind a collapsed group.
  useEffect(() => {
    const activeGroup = GROUPS.find((g) => g.items.some((i) => itemMatchesPath(i, pathname)));
    if (activeGroup && openGroups[activeGroup.id] === false) {
      setOpenGroups((prev) => ({ ...prev, [activeGroup.id]: true }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const topItems = TOP_ITEMS.filter((i) => canSee(i, currentUser, isEnabled));
  const groups = GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => canSee(i, currentUser, isEnabled)),
  })).filter((g) => g.items.length > 0);
  const bottomItems = BOTTOM_ITEMS.filter((i) => canSee(i, currentUser, isEnabled));

  const renderItem = (item: NavItem, indented = false) => {
    const Icon = item.icon;
    return (
      <NavLink
        key={item.to}
        to={item.to}
        end={item.to === "/" || item.to === "/carwash/reports"}
        title={collapsed ? item.label : undefined}
        className={({ isActive }) =>
          cn(
            "flex items-center h-9 rounded-lg text-sm transition-colors",
            collapsed ? "justify-center px-0 h-10" : indented ? "gap-3 px-3 ms-2" : "gap-3 px-3",
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
  };

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
          collapsed ? "p-3 justify-center" : "p-4"
        )}
      >
        <div
          className={cn(
            "w-10 h-10 rounded-xl grid place-items-center overflow-hidden shrink-0",
            !settings.logoImage && "bg-gradient-to-br from-brand-600 to-brand-800 text-white font-bold"
          )}
        >
          {settings.logoImage ? (
            <img src={settings.logoImage} alt="Logo" className="w-full h-full object-contain" />
          ) : (
            settings.logoText || "HD"
          )}
        </div>
        <div className={cn("min-w-0 flex-1", collapsed && "hidden")}>
          <div className="font-semibold text-slate-900 truncate text-sm">
            {settings.arabicLabels ? settings.companyNameAr : settings.companyName}
          </div>
          <div className="text-[11px] text-slate-500">نظام إدارة غسيل السيارات</div>
        </div>
      </div>
      <nav className={cn("p-2 flex-1 overflow-y-auto", collapsed && "space-y-1")}>
        {collapsed ? (
          // icon-only mode: flat list, groups add nothing at this width
          [...topItems, ...groups.flatMap((g) => g.items), ...bottomItems].map((item) =>
            renderItem(item)
          )
        ) : (
          <>
            {topItems.map((item) => renderItem(item))}
            {groups.map((group) => {
              const open = openGroups[group.id] ?? true;
              return (
                <div key={group.id} className="mt-1">
                  <button
                    type="button"
                    onClick={() =>
                      setOpenGroups((prev) => ({ ...prev, [group.id]: !open }))
                    }
                    className="w-full flex items-center justify-between px-3 h-8 text-[11px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wide"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      className={cn("w-3.5 h-3.5 transition-transform", !open && "-rotate-90")}
                    />
                  </button>
                  {open ? (
                    <div className="space-y-0.5">
                      {group.items.map((item) => renderItem(item, true))}
                    </div>
                  ) : null}
                </div>
              );
            })}
            {bottomItems.length > 0 ? (
              <div className="mt-1 pt-1 border-t border-slate-100">
                {bottomItems.map((item) => renderItem(item))}
              </div>
            ) : null}
          </>
        )}
      </nav>
      <div className="p-3 border-t border-slate-100">
        <button
          type="button"
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
