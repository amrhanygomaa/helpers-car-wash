import { useEffect, useMemo, useState } from "react";
import {
  UserRound,
  Target,
  DollarSign,
  TrendingUp,
  Calendar,
  FileText,
  Percent,
  KeyRound,
  Save,
} from "lucide-react";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Badge } from "../components/ui/Badge";
import { Field, Input } from "../components/ui/Input";
import { Button } from "../components/ui/Button";
import { EmptyState } from "../components/ui/EmptyState";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { PageHeader } from "../components/layout/AppLayout";
import { useApp } from "../store/AppContext";
import { formatCurrency } from "../lib/format";
import { useToast } from "../components/ui/Toast";

export function EmployeeProfilePage() {
  const {
    currentUser,
    users,
    employeeSalesStats,
    settings,
    salesInvoices,
    updateCurrentUserProfile,
  } = useApp();
  const toast = useToast();
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profileErrors, setProfileErrors] = useState<Record<string, string>>({});
  const [savingProfile, setSavingProfile] = useState(false);

  const employee =
    currentUser?.role === "employee"
      ? users.find((u) => u.id === currentUser.id) ?? currentUser
      : null;
  const savedProfileName = employee?.name || employee?.username || "";

  useEffect(() => {
    setProfileName(savedProfileName);
  }, [savedProfileName]);

  const employeeId = employee?.id;
  const stats = employee ? employeeSalesStats(employee.id, selectedMonth) : null;
  const hasTarget = Boolean(stats && stats.target > 0);
  const targetDelta = stats ? Math.abs(stats.totalSales - stats.target) : 0;
  const progress =
    stats && hasTarget ? Math.min(100, (stats.totalSales / stats.target) * 100) : 0;

  const employeeInvoices = useMemo(
    () =>
      employeeId
        ? salesInvoices.filter((inv) => inv.createdByUserId === employeeId)
        : [],
    [salesInvoices, employeeId]
  );

  const monthlyInvoices = useMemo(() => {
    const grouped = new Map<string, typeof employeeInvoices>();
    employeeInvoices.forEach((invoice) => {
      const month = invoice.date.slice(0, 7);
      if (!grouped.has(month)) {
        grouped.set(month, []);
      }
      grouped.get(month)!.push(invoice);
    });
    return grouped;
  }, [employeeInvoices]);

  const selectedMonthInvoices = monthlyInvoices.get(selectedMonth) || [];

  async function handleProfileSave() {
    const nextErrors: Record<string, string> = {};
    const changingPassword = Boolean(currentPassword || newPassword || confirmPassword);

    if (!profileName.trim()) nextErrors.name = "الاسم مطلوب";
    if (changingPassword) {
      if (!currentPassword) nextErrors.currentPassword = "أدخل كلمة المرور الحالية";
      if (newPassword.length < 6) nextErrors.newPassword = "كلمة المرور لا تقل عن 6 حروف";
      if (newPassword !== confirmPassword) nextErrors.confirmPassword = "كلمتا المرور غير متطابقتين";
    }

    if (Object.keys(nextErrors).length > 0) {
      setProfileErrors(nextErrors);
      return;
    }

    setSavingProfile(true);
    const result = await updateCurrentUserProfile({
      name: profileName.trim(),
      currentPassword: changingPassword ? currentPassword : undefined,
      newPassword: changingPassword ? newPassword : undefined,
    });
    setSavingProfile(false);

    if (result.ok) {
      setProfileErrors({});
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast.success("تم حفظ بياناتك");
      return;
    }

    const errorMap: Record<NonNullable<typeof result.error>, string> = {
      not_authenticated: "سجل الدخول مرة أخرى",
      invalid_name: "الاسم مطلوب",
      invalid_current_password: "كلمة المرور الحالية غير صحيحة",
      password_too_short: "كلمة المرور لا تقل عن 6 حروف",
      user_missing: "تعذر العثور على حسابك",
    };
    if (result.error === "invalid_current_password") {
      setProfileErrors({ currentPassword: errorMap[result.error] });
    } else if (result.error === "invalid_name") {
      setProfileErrors({ name: errorMap[result.error] });
    } else if (result.error === "password_too_short") {
      setProfileErrors({ newPassword: errorMap[result.error] });
    } else {
      toast.error("تعذر حفظ البيانات", errorMap[result.error ?? "not_authenticated"]);
    }
  }

  if (!currentUser || currentUser.role !== "employee") {
    return (
      <div className="flex items-center justify-center h-96">
        <EmptyState
          icon={<UserRound className="w-5 h-5" />}
          title="صفحة الموظف فقط"
          description="هذه الصفحة متاحة للموظفين فقط"
        />
      </div>
    );
  }

  if (!employee || !stats) {
    return null;
  }

  return (
    <>
      <PageHeader
        title="ملفي الشخصي"
        description="عرض معلوماتك الشخصية والراتب والعمولات والتقارير"
      />

      {/* Personal Info Card */}
      <Card className="mb-4">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <UserRound className="w-5 h-5 text-brand-600" />
              <span>المعلومات الشخصية</span>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <InfoRow label="اسم الموظف" value={employee.name || employee.username} icon={<UserRound />} />
            <InfoRow label="اسم الدخول" value={employee.username} icon={<UserRound />} />
            <InfoRow label="تاريخ الإنشاء" value={new Date(employee.createdAt).toLocaleDateString("ar-EG")} icon={<Calendar />} />
            <InfoRow label="الراتب الشهري" value={formatCurrency(stats.salary, settings.currency)} icon={<DollarSign />} />
            <InfoRow label="نسبة العمولة" value={`${employee.salesCommissionPct ?? 0}%`} icon={<Percent />} />
            {hasTarget && (
              <InfoRow label="التارجت الشهري" value={formatCurrency(stats.target, settings.currency)} icon={<Target />} />
            )}
          </div>
        </CardBody>
      </Card>

      <Card className="mb-4">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <KeyRound className="w-5 h-5 text-brand-600" />
              <span>تعديل بيانات الموظف</span>
            </div>
          }
        />
        <CardBody>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="اسم الموظف" required error={profileErrors.name}>
              <Input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
              />
            </Field>
            <Field label="اسم الدخول">
              <Input value={employee.username} readOnly className="bg-slate-50" />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
            <Field label="كلمة المرور الحالية" error={profileErrors.currentPassword}>
              <Input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label="كلمة المرور الجديدة" error={profileErrors.newPassword}>
              <Input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Field label="تأكيد كلمة المرور" error={profileErrors.confirmPassword}>
              <Input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </Field>
          </div>
          <div className="flex justify-end mt-4">
            <Button onClick={handleProfileSave} disabled={savingProfile}>
              <Save className="w-4 h-4" />
              {savingProfile ? "جاري الحفظ..." : "حفظ البيانات"}
            </Button>
          </div>
        </CardBody>
      </Card>

      {/* Month Selection */}
      <Card className="mb-4">
        <CardBody>
          <Field label="الشهر">
            <Input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-52"
            />
          </Field>
        </CardBody>
      </Card>

      {/* Monthly Stats Card */}
      <Card className="mb-4">
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-brand-600" />
              <span>إحصائيات الشهر الحالي</span>
            </div>
          }
        />
        <CardBody className="space-y-4">
          {hasTarget && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>نسبة تحقيق التارجت</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div
                  className={`h-full rounded-full ${stats.achieved ? "bg-emerald-500" : "bg-amber-500"}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}

          <div className="divide-y divide-slate-100 border-y border-slate-100">
            <StatsRow
              label="المبيعات"
              value={formatCurrency(stats.totalSales, settings.currency)}
              icon={<Target />}
            />
            {hasTarget && (
              <>
                <StatsRow
                  label="التارجت"
                  value={formatCurrency(stats.target, settings.currency)}
                  icon={<Target />}
                  suffix={
                    <Badge tone={stats.achieved ? "green" : "amber"}>
                      {stats.achieved ? "محقق" : "غير محقق"}
                    </Badge>
                  }
                />
                <StatsRow
                  label={stats.achieved ? "زيادة عن التارجت" : "ناقص على التارجت"}
                  value={formatCurrency(targetDelta, settings.currency)}
                  icon={<Target />}
                  tone={stats.achieved ? "green" : "amber"}
                />
              </>
            )}
            <StatsRow
              label="الراتب"
              value={formatCurrency(stats.salary, settings.currency)}
              icon={<DollarSign />}
            />
            <StatsRow
              label={`العمولة (${employee.salesCommissionPct ?? 0}%)`}
              value={formatCurrency(stats.commissionEarned, settings.currency)}
              icon={<Percent />}
            />
            <StatsRow
              label="الإجمالي المستحق"
              value={formatCurrency(stats.totalEarnings, settings.currency)}
              icon={<DollarSign />}
              tone="green"
              strong
            />
          </div>
        </CardBody>
      </Card>

      {/* Invoices Card */}
      <Card>
        <CardHeader
          title={
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-brand-600" />
              <span>فواتير الشهر</span>
            </div>
          }
        />
        <CardBody>
          {selectedMonthInvoices.length === 0 ? (
            <EmptyState
              icon={<FileText className="w-5 h-5" />}
              title="لا توجد فواتير"
              description="لم تقم بإنشاء أي فواتير في هذا الشهر"
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>رقم الفاتورة</TH>
                  <TH>التاريخ</TH>
                  <TH>العميل</TH>
                  <TH>المجموع</TH>
                  <TH>الحالة</TH>
                </TR>
              </THead>
              <TBody>
                {selectedMonthInvoices.map((invoice) => (
                  <TR key={invoice.id}>
                    <TD>{invoice.invoiceNumber}</TD>
                    <TD>{new Date(invoice.date).toLocaleDateString("ar-EG")}</TD>
                    <TD>{invoice.customerName}</TD>
                    <TD>{formatCurrency(invoice.total, settings.currency)}</TD>
                    <TD>
                      <Badge tone={invoice.status === "paid" ? "green" : invoice.status === "partial" ? "amber" : "red"}>
                        {invoice.status === "paid" ? "مدفوع" : invoice.status === "partial" ? "مدفوع جزئياً" : "غير مدفوع"}
                      </Badge>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </>
  );
}

function InfoRow({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="text-slate-400">{icon}</div>
      <div className="text-slate-600">{label}:</div>
      <div className="font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function StatsRow({
  label,
  value,
  icon,
  suffix,
  tone = "slate",
  strong,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  suffix?: React.ReactNode;
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
        <div className="text-slate-400">{icon}</div>
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
