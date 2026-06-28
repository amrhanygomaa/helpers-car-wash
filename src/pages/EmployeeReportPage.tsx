import { useEffect, useRef, useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Sparkles, Target, TrendingUp, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { useUsers } from "../store/UsersContext";
import { useReporting } from "../store/ReportingContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { useFeatures } from "../lib/useFeatures";
import { employeeServiceStats } from "../store/_pure";
import { formatCurrency } from "../lib/format";
import { localISODate, MONTH_NAMES_AR } from "../lib/utils";

function ProgressBar({ pct, achieved }: { pct: number; achieved: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.style.setProperty("--pct", `${Math.min(100, pct)}%`);
  }, [pct]);
  return (
    <div className={`progress-fill h-2 rounded-full transition-all ${achieved ? "bg-emerald-500" : "bg-amber-400"}`} ref={ref} />
  );
}

function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const from = `${month}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const to = `${month}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}

function currentMonth(): string {
  return localISODate().slice(0, 7);
}

function buildMonthOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  // Last 11 months + current + next 2 = 14 options total
  for (let i = -11; i <= 2; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const yyyymm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = `${MONTH_NAMES_AR[d.getMonth()]} ${d.getFullYear()}`;
    options.push({ value: yyyymm, label });
  }
  return options.reverse();
}

export function EmployeeReportPage() {
  const { users } = useUsers();
  const { employeeSalesStats } = useReporting();
  const { salesInvoices } = useInvoicing();
  const { settings } = useSettings();
  const { isEnabled } = useFeatures();
  const navigate = useNavigate();
  const [month, setMonth] = useState(currentMonth);
  const monthOptions = useMemo(() => buildMonthOptions(), []);
  const showWash = isEnabled("washServices");

  const employees = useMemo(
    () => users.filter((user) => user.role === "employee"),
    [users]
  );

  return (
    <>
      <PageHeader
        title="تقرير الموظفين"
        description="متابعة المحصَّل والعمولات الشهرية لكل موظف"
        actions={
          <Button variant="outline" onClick={() => navigate("/reports")}>
            <ArrowRight className="w-4 h-4" /> رجوع للتقارير
          </Button>
        }
      />

      <Card>
        <CardBody>
          <Field label="الشهر">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              aria-label="الشهر"
              className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {monthOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </Field>
        </CardBody>
      </Card>

      {employees.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<UserRound className="w-5 h-5" />}
              title="لا يوجد موظفون"
              description="أضف موظفين من صفحة المستخدمين لعرض التقرير."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {employees.map((employee) => {
            const stats = employeeSalesStats(employee.id, month);
            const targetPct = stats.target > 0
              ? Math.min(100, Math.round((stats.totalCollected / stats.target) * 100))
              : null;
            const achieved = stats.target > 0 && stats.totalCollected >= stats.target;
            const { from, to } = monthRange(month);
            const washStats = showWash ? employeeServiceStats(salesInvoices, employee.id, from, to) : null;
            const washCommission = washStats ? (washStats.attributedRevenue * (employee.salesCommissionPct ?? 0)) / 100 : 0;

            return (
              <Card key={employee.id}>
                <CardHeader
                  title={
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-brand-600" />
                      <span>{employee.name || employee.username}</span>
                    </div>
                  }
                  actions={
                    <span className="text-xs text-slate-400">{stats.monthLabel}</span>
                  }
                />
                <CardBody className="space-y-3">
                  <div className="divide-y divide-slate-100 border-y border-slate-100">
                    <ReportRow
                      label="المحصَّل في الشهر"
                      value={formatCurrency(stats.totalCollected, settings.currency)}
                      tone="slate"
                    />
                    <ReportRow
                      label="الراتب"
                      value={formatCurrency(stats.salary, settings.currency)}
                    />
                    <ReportRow
                      label={`العمولة (${stats.commissionPct}%)`}
                      value={formatCurrency(stats.commissionEarned, settings.currency)}
                      tone="amber"
                    />
                    <ReportRow
                      label="الإجمالي"
                      value={formatCurrency(stats.totalEarnings, settings.currency)}
                      tone="green"
                      strong
                    />
                  </div>

                  {/* Target progress */}
                  {stats.target > 0 ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-500 flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          التارجت: {formatCurrency(stats.target, settings.currency)}
                        </span>
                        <div className="flex items-center gap-1.5">
                          {achieved ? (
                            <Badge tone="green">
                              <TrendingUp className="w-3 h-3 inline ml-0.5" />
                              محقق
                              {stats.totalCollected > stats.target && ` +${formatCurrency(stats.totalCollected - stats.target, settings.currency)}`}
                            </Badge>
                          ) : (
                            <Badge tone="amber">
                              متبقي {formatCurrency(stats.target - stats.totalCollected, settings.currency)}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <ProgressBar pct={targetPct ?? 0} achieved={achieved} />
                      </div>
                      <div className="text-xs text-slate-400 text-end">{targetPct ?? 0}%</div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 text-center py-1">لا يوجد تارجت لهذا الشهر</div>
                  )}

                  {/* Car wash service performance — shown when washServices feature is on */}
                  {washStats && (washStats.carsWashed > 0 || washStats.servicesPerformed > 0) && (
                    <div className="border border-cyan-100 bg-cyan-50/50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-700 mb-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        أداء الغسيل
                      </div>
                      <div className="divide-y divide-cyan-100">
                        <ReportRow label="سيارات مغسولة" value={String(washStats.carsWashed)} tone="slate" />
                        <ReportRow label="خدمات منفّذة" value={String(washStats.servicesPerformed)} tone="slate" />
                        <ReportRow label="إيراد منسوب" value={formatCurrency(washStats.attributedRevenue, settings.currency)} tone="slate" />
                        {(employee.salesCommissionPct ?? 0) > 0 && (
                          <ReportRow
                            label={`عمولة الغسيل (${employee.salesCommissionPct}%)`}
                            value={formatCurrency(washCommission, settings.currency)}
                            tone="amber"
                          />
                        )}
                      </div>
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}

function ReportRow({
  label,
  value,
  suffix,
  tone = "slate",
  strong,
}: {
  label: string;
  value: string;
  suffix?: ReactNode;
  tone?: "slate" | "green" | "amber";
  strong?: boolean;
}) {
  const colors: Record<"slate" | "green" | "amber", string> = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
  };

  return (
    <div className="flex items-center justify-between gap-3 py-3 text-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <Target className="w-3.5 h-3.5 text-slate-400" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {suffix}
        <span className={`${colors[tone]} ${strong ? "font-bold text-base" : "font-semibold"}`}>
          {value}
        </span>
      </div>
    </div>
  );
}
