import type { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

export function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex bg-slate-50" dir="rtl">
      <div className="no-print">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="no-print">
          <Topbar />
        </div>
        <main className="flex-1 p-5 space-y-5">{children}</main>
        
        <footer className="no-print mt-auto py-6 px-5 border-t border-slate-200 bg-white">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-bold text-brand-600">© 2026 جميع الحقوق محفوظة لشركة Helpers Technologies</span>
              <span className="hidden md:inline">|</span>
              <span>نظام إدارة المستودعات الذكي v2.1.0</span>
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
