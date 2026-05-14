import { useMemo, useState, type ReactNode } from "react";
import { ArrowRight, Target, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Input";
import { EmptyState } from "../components/ui/EmptyState";
import { useApp } from "../store/AppContext";
import { formatCurrency } from "../lib/format";

export function EmployeeReportPage() {
  const { users, employeeSalesStats, settings } = useApp();
  const navigate = useNavigate();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

  const employees = useMemo(
    () => users.filter((user) => user.role === "employee"),
    [users]
  );

  return (
    <>
      <PageHeader
        title="تقرير الموظفين"
        description="متابعة المبيعات والتارجت والعمولات الشهرية لكل موظف"
        actions={
          <Button variant="outline" onClick={() => navigate("/reports")}>
            <ArrowRight className="w-4 h-4" /> رجوع للتقارير
          </Button>
        }
      />

      <Card>
        <CardBody>
          <Field label="الشهر">
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-52"
            />
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
            const hasTarget = stats.target > 0;
            const targetDelta = Math.abs(stats.totalSales - stats.target);
            const progress = hasTarget
              ? Math.min(100, (stats.totalSales / stats.target) * 100)
              : 0;

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
                    hasTarget ? (
                      <Badge tone={stats.achieved ? "green" : "amber"}>
                        {stats.achieved ? "محقق" : "لم يحقق بعد"}
                      </Badge>
                    ) : null
                  }
                />
                <CardBody className="space-y-4">
                  {hasTarget ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>نسبة تحقيق التارجت</span>
                        <span>{Math.round(progress)}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            stats.achieved ? "bg-emerald-500" : "bg-amber-500"
                          }`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div className="divide-y divide-slate-100 border-y border-slate-100">
                    <ReportRow
                      label="المبيعات"
                      value={formatCurrency(stats.totalSales, settings.currency)}
                    />
                    {hasTarget ? (
                      <>
                        <ReportRow
                          label="التارجت"
                          value={formatCurrency(stats.target, settings.currency)}
                          suffix={
                            <Badge tone={stats.achieved ? "green" : "amber"}>
                              {stats.achieved ? "محقق" : "غير محقق"}
                            </Badge>
                          }
                        />
                        <ReportRow
                          label={stats.achieved ? "زيادة عن التارجت" : "ناقص على التارجت"}
                          value={formatCurrency(targetDelta, settings.currency)}
                          tone={stats.achieved ? "green" : "amber"}
                        />
                      </>
                    ) : null}
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
