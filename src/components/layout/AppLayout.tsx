import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertTriangle, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { LockScreen } from "./LockScreen";
import { useAuth } from "../../store/AuthContext";
import { useSettings } from "../../store/SettingsContext";
import { lsGet, lsSet } from "../../lib/storage";

export function AppLayout({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() =>
    lsGet("sidebarCollapsed", false)
  );
  const { isLocked, lockSession, licenseStatus } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [renewDismissed, setRenewDismissed] = useState(false);
  const [subDaysLeft, setSubDaysLeft] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Proactive renewal reminder: warn when a limited subscription is within 14
  // days of expiry so the owner can renew before the system locks. Computed in
  // an effect (re-checked hourly) to keep render pure.
  const expiresAt =
    licenseStatus?.license?.subscriptionType === "limited"
      ? licenseStatus.license.subscriptionExpiresAt
      : null;
  useEffect(() => {
    if (!expiresAt) {
      setSubDaysLeft(null);
      return;
    }
    const compute = () =>
      setSubDaysLeft(Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86400000));
    compute();
    const id = window.setInterval(compute, 60 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);
  const showRenewBanner =
    subDaysLeft !== null && subDaysLeft >= 0 && subDaysLeft <= 14 && !renewDismissed;

  // The copyright footer is shown only on the Settings page.
  const showFooter = useLocation().pathname === "/settings";

  useEffect(() => {
    lsSet("sidebarCollapsed", sidebarCollapsed);
  }, [sidebarCollapsed]);

  useEffect(() => {
    const minutes = settings.idleLockMinutes ?? 0;
    if (!minutes || isLocked) return;
    const ms = minutes * 60 * 1000;

    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(lockSession, ms);
    }

    const events = ["mousemove", "keydown", "click", "touchstart", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, reset, { passive: true }));
    reset();

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, reset));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [settings.idleLockMinutes, isLocked, lockSession]);

  return (
    <div className="h-screen overflow-hidden flex bg-slate-50" dir="rtl">
      {isLocked && <LockScreen />}
      <div className="no-print">
        <Sidebar collapsed={sidebarCollapsed} />
      </div>
      <div className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="no-print">
          <Topbar
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((value) => !value)}
          />
        </div>

        {showRenewBanner && (
          <div
            className={`no-print shrink-0 flex items-center justify-between gap-3 px-5 py-2.5 text-sm font-bold border-b ${
              (subDaysLeft as number) <= 3
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-amber-50 text-amber-800 border-amber-200"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>
                {subDaysLeft === 0
                  ? "اشتراكك ينتهي اليوم — جدّد الآن قبل توقّف النظام"
                  : `اشتراكك ينتهي خلال ${subDaysLeft} يوم — جدّد الآن قبل توقّف النظام`}
              </span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigate("/settings")}
                className={`h-7 px-3 rounded-lg text-white text-xs font-bold transition-colors ${
                  (subDaysLeft as number) <= 3 ? "bg-rose-600 hover:bg-rose-700" : "bg-amber-600 hover:bg-amber-700"
                }`}
              >
                تجديد الآن
              </button>
              <button
                onClick={() => setRenewDismissed(true)}
                aria-label="إخفاء"
                className="w-7 h-7 grid place-items-center rounded-lg hover:bg-black/5 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <main className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5">{children}</main>

        {showFooter && (
        <footer className="no-print shrink-0 py-6 px-5 border-t border-slate-200 bg-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-bold text-brand-600">© 2026 جميع الحقوق محفوظة لشركة Helpers Technologies</span>
              <span className="hidden md:inline">|</span>
              <span>نظام إدارة المستودعات الذكي v{__APP_VERSION__}</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="https://wa.me/201118445625" target="_blank" rel="noreferrer" className="hover:text-emerald-600 flex items-center gap-1.5 transition-colors">
                <span>واتساب الدعم: +201118445625</span>
              </a>
              <a href="https://helpers-tech.com/" target="_blank" rel="noreferrer" className="hover:text-brand-600 flex items-center gap-1.5 transition-colors">
                <span>الموقع الرسمي: helpers-tech.com</span>
              </a>
            </div>
          </div>
        </footer>
        )}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {description ? (
          <p className="text-sm text-slate-500 mt-0.5">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
