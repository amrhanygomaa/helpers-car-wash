import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Target, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { useUsers } from "../store/UsersContext";
import { useReporting } from "../store/ReportingContext";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency } from "../lib/format";

function currentQuarter() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
}

function buildQuarterOptions(): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  const now = new Date();
  let year = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 8; i++) {
    options.push({ value: `${year}-Q${q}`, label: `الربع ${q} — ${year}` });
    q--;
    if (q === 0) { q = 4; year--; }
  }
  return options;
}

export function EmployeeReportPage() {
  const { users } = useUsers();
  const { employeeSalesStats } = useReporting();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [quarter, setQuarter] = useState(currentQuarter);
  const quarterOptions = useMemo(() => buildQuarterOptions(), []);

  const employees = useMemo(
    () => users.filter((user) => user.role === "employee"),
    [users]
  );

  return (
    <>
      <PageHeader
        title="تقرير الموظفين"
        description="متابعة المحصَّل والعمولات الربعية لكل موظف"
        actions={
          <Button variant="outline" onClick={() => navigate("/reports")}>
            <ArrowRight className="w-4 h-4" /> رجوع للتقارير
          </Button>
        }
      />

      <Card>
        <CardBody>
          <Field label="الربع">
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="w-52 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {quarterOptions.map((opt) => (
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
            const stats = employeeSalesStats(employee.id, quarter);
            return (
              <Card key={employee.id}>
                <CardHeader
                  title={
                    <div className="flex items-center gap-2">
                      <UserRound className="w-4 h-4 text-brand-600" />
                      <span>{employee.name || employee.username}</span>
                    </div>
                  }
                />
                <CardBody>
                  <div className="divide-y divide-slate-100 border-y border-slate-100">
                    <ReportRow
                      label="المحصَّل في الربع"
                      value={formatCurrency(stats.totalCollected, settings.currency)}
                    />
                    <ReportRow
                      label="الراتب"
                      value={formatCurrency(stats.salary, settings.currency)}
                    />
                    <ReportRow
                      label={`العمولة (${employee.salesCommissionPct ?? 0}%)`}
                      value={formatCurrency(stats.commissionEarned, settings.currency)}
                    />
                    <ReportRow
                      label="الإجمالي"
                      value={formatCurrency(stats.totalEarnings, settings.currency)}
                      tone="green"
                      strong
                    />
                  </div>
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
