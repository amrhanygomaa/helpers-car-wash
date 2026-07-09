import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  TrendingUp,
  DollarSign,
  Calendar,
  Trash2,
  Plus,
  Sparkles,
  Award,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { hasDb, db } from "../db/client";
import { workers, dailyClosures, workerWithdrawals } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { listWorkerWithdrawalsForWorker, recordWorkerFinancialAdjustment, deleteWorkerWithdrawal } from "../features/treasury/queries";
import { listDailyClosuresForWorker } from "../features/payroll/queries";
import { dailyBaseAmount } from "../features/payroll/compute";
import { formatCurrency, formatDate } from "../lib/format";
import { useSettings } from "../store/SettingsContext";
import { useInvoicing } from "../store/InvoicingContext";
import { lineWorkers } from "../store/_pure";
import { todayISO, uid } from "../lib/utils";
import { piastresToEgp, egpToPiastres } from "../lib/money";
import type { Worker, DailyClosure, WorkerWithdrawal } from "../db/schema";

const WAGE_LABELS: Record<string, string> = {
  daily_fixed: "يومي ثابت",
  monthly: "شهري",
  commission_only: "عمولة فقط",
};

export function WorkerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();
  const { salesInvoices } = useInvoicing();

  const [worker, setWorker] = useState<Worker | null>(null);
  const [closures, setClosures] = useState<DailyClosure[]>([]);
  const [withdrawals, setWithdrawals] = useState<WorkerWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);

  // Month selector
  const [selectedMonth, setSelectedMonth] = useState(() => todayISO().slice(0, 7));

  // Dialog for logging transactions
  const [txnOpen, setTxnOpen] = useState(false);
  const [txnType, setTxnType] = useState<"advance" | "deduction" | "bonus">("advance");
  const [txnAmount, setTxnAmount] = useState("");
  const [txnReason, setTxnReason] = useState("");
  const [txnDate, setTxnDate] = useState(todayISO());
  const [txnSaving, setTxnSaving] = useState(false);

  // Load worker data
  const loadData = async () => {
    if (!id || !hasDb()) {
      setLoading(false);
      return;
    }
    try {
      const workerRes = await db.select().from(workers).where(eq(workers.id, id)).limit(1);
      if (workerRes[0]) {
        setWorker(workerRes[0]);
        const closuresRes = await listDailyClosuresForWorker(id);
        const withdrawalsRes = await listWorkerWithdrawalsForWorker(id);
        setClosures(closuresRes);
        setWithdrawals(withdrawalsRes);
      }
    } catch (err) {
      console.error(err);
      toast.error("فشل في تحميل بيانات العامل");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  // Months lists from data for selection dropdown
  const monthOptions = useMemo(() => {
    const months = new Set<string>([todayISO().slice(0, 7)]);
    closures.forEach((c) => months.add(c.businessDate.slice(0, 7)));
    withdrawals.forEach((w) => months.add(w.businessDate.slice(0, 7)));
    return Array.from(months).sort((a, b) => b.localeCompare(a));
  }, [closures, withdrawals]);

  // Filtered data for selected month
  const monthClosures = useMemo(() => {
    return closures.filter((c) => c.businessDate.startsWith(selectedMonth));
  }, [closures, selectedMonth]);

  const monthWithdrawals = useMemo(() => {
    return withdrawals.filter((w) => w.businessDate.startsWith(selectedMonth));
  }, [withdrawals, selectedMonth]);

  // Calculate detailed financial metrics
  const financials = useMemo(() => {
    // 1. Base wage sum
    const totalBase = monthClosures.reduce((sum, c) => sum + c.baseAmount, 0);

    // 2. Commissions sum
    const totalCommissions = monthClosures.reduce((sum, c) => sum + c.commissionTotal, 0);

    // 3. Advances / sulafeh (amount > 0, reason does not start with "خصم" or "جزاء")
    const totalAdvances = monthWithdrawals
      .filter((w) => w.amount > 0 && !w.reason?.startsWith("خصم:") && !w.reason?.startsWith("جزاء:"))
      .reduce((sum, w) => sum + w.amount, 0);

    // 4. Deductions / khasm (amount > 0, reason starts with "خصم" or "جزاء")
    const totalDeductions = monthWithdrawals
      .filter((w) => w.amount > 0 && (w.reason?.startsWith("خصم:") || w.reason?.startsWith("جزاء:")))
      .reduce((sum, w) => sum + w.amount, 0);

    // 5. Bonuses / rewards (amount < 0) - stored as negative withdrawals
    const totalBonuses = monthWithdrawals
      .filter((w) => w.amount < 0)
      .reduce((sum, w) => sum + Math.abs(w.amount), 0);

    // 6. Net due
    // netDue = base + commissions + bonuses - advances - deductions
    const netDue = totalBase + totalCommissions + Math.round(monthWithdrawals.reduce((sum, w) => sum - w.amount, 0));

    // Performance indicators
    const totalCars = monthClosures.reduce((sum, c) => sum + c.carsCount, 0);

    return {
      totalBase: piastresToEgp(totalBase),
      totalCommissions: piastresToEgp(totalCommissions),
      totalAdvances: piastresToEgp(totalAdvances),
      totalDeductions: piastresToEgp(totalDeductions),
      totalBonuses: piastresToEgp(totalBonuses),
      netDue: piastresToEgp(netDue),
      totalCars,
    };
  }, [monthClosures, monthWithdrawals]);

  // Handles adding transaction (advance, deduction, bonus)
  async function handleAddTxn() {
    if (!worker || !id) return;
    const amountEgp = Number(txnAmount);
    if (Number.isNaN(amountEgp) || amountEgp <= 0) {
      toast.error("المبلغ يجب أن يكون رقم أكبر من الصفر");
      return;
    }
    if (!txnReason.trim()) {
      toast.error("يرجى إدخال بيان المعاملة");
      return;
    }

    setTxnSaving(true);
    try {
      // Convert to piastres
      let amountPiastres = egpToPiastres(amountEgp);
      let finalReason = txnReason.trim();

      if (txnType === "deduction") {
        if (!finalReason.startsWith("خصم:")) {
          finalReason = `خصم: ${finalReason}`;
        }
      } else if (txnType === "bonus") {
        if (!finalReason.startsWith("بونص:")) {
          finalReason = `بونص: ${finalReason}`;
        }
        // Bonuses are stored as negative values to increase netDue
        amountPiastres = -amountPiastres;
      } else {
        if (!finalReason.startsWith("سحب:")) {
          finalReason = `سحب: ${finalReason}`;
        }
      }

      await recordWorkerFinancialAdjustment({
        withdrawalId: uid("wd"),
        treasuryEntryId: uid("tre"),
        workerId: id,
        businessDate: txnDate,
        amount: amountPiastres,
        reason: finalReason,
        branchId: settings.currentBranchId || "branch-main",
        createdAt: new Date().toISOString(),
      });

      toast.success("تم تسجيل المعاملة بنجاح");
      setTxnOpen(false);
      setTxnAmount("");
      setTxnReason("");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("حدث خطأ أثناء حفظ المعاملة");
    } finally {
      setTxnSaving(false);
    }
  }

  // Handles deleting transaction
  async function handleDeleteTxn(withdrawalId: string) {
    if (!confirm("هل أنت متأكد من حذف هذه المعاملة؟ سيؤدي ذلك أيضاً إلى تعديل رصيد الخزينة المصاحب.")) return;
    try {
      await deleteWorkerWithdrawal(withdrawalId);
      toast.success("تم حذف المعاملة");
      loadData();
    } catch (err) {
      console.error(err);
      toast.error("فشل في حذف المعاملة");
    }
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        جاري التحميل...
      </div>
    );
  }

  if (!worker) {
    return (
      <Card>
        <CardBody dir="rtl">
          <div className="text-center py-8">
            <div className="text-slate-900 font-medium">العامل غير موجود</div>
            <Button className="mt-4" onClick={() => navigate("/payroll/day-close")}>
              العودة لكشف اليومية
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  return (
    <div className="space-y-6 text-right" dir="rtl">
      <PageHeader
        title={`كشف حساب: ${worker.name}`}
        description={`نظام الأجر: ${WAGE_LABELS[worker.wageType]} ${
          worker.baseWage ? `(${formatCurrency(piastresToEgp(worker.baseWage), settings.currency)})` : ""
        }`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/payroll/day-close")}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button onClick={() => setTxnOpen(true)}>
              <Plus className="w-4 h-4" /> حركة مالية جديدة
            </Button>
          </>
        }
      />

      {/* Month Filter Card */}
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-5 h-5 text-slate-400" />
            <span className="text-sm font-semibold text-slate-700">تصفية الشهر المحدد:</span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-48 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>
                  {new Date(m + "-01").toLocaleDateString("ar-EG", { year: "numeric", month: "long" })}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Badge tone={worker.active ? "green" : "slate"}>
              {worker.active ? "نشط بالعمل" : "معطل / غير نشط"}
            </Badge>
          </div>
        </CardBody>
      </Card>

      {/* Financial Metrics Dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard
          icon={<DollarSign />}
          label="الراتب الأساسي المحتسب"
          value={formatCurrency(financials.totalBase, settings.currency)}
          tone="slate"
        />
        <StatCard
          icon={<TrendingUp />}
          label="إجمالي العمولات"
          value={formatCurrency(financials.totalCommissions, settings.currency)}
          tone="blue"
        />
        <StatCard
          icon={<Sparkles />}
          label="إجمالي البونص والمكافآت"
          value={formatCurrency(financials.totalBonuses, settings.currency)}
          tone="green"
        />
        <StatCard
          icon={<DollarSign />}
          label="إجمالي السلف والمسحوبات"
          value={formatCurrency(financials.totalAdvances, settings.currency)}
          tone="amber"
        />
        <StatCard
          icon={<AlertCircle />}
          label="إجمالي الخصومات والجزاءات"
          value={formatCurrency(financials.totalDeductions, settings.currency)}
          tone="rose"
        />
        <StatCard
          icon={<Award />}
          label="صافي المستحق النهائي"
          value={formatCurrency(financials.netDue, settings.currency)}
          tone={financials.netDue >= 0 ? "green" : "rose"}
          highlight
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Performance and Work Days table */}
        <Card className="lg:col-span-1">
          <CardHeader
            title="سجل الأداء اليومي"
            subtitle={`إجمالي السيارات المغسولة هذا الشهر: ${financials.totalCars} سيارة`}
          />
          <CardBody className="p-0">
            {monthClosures.length === 0 ? (
              <div className="p-6">
                <EmptyState title="لا توجد أيام عمل مسجلة" description="سيظهر النشاط بعد إقفال يومية العمال." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>التاريخ</TH>
                    <TH className="text-end">السيارات</TH>
                    <TH className="text-end">العمولة</TH>
                    <TH className="text-end">الصافي</TH>
                  </TR>
                </THead>
                <TBody>
                  {monthClosures.map((c) => (
                    <TR key={c.id}>
                      <TD className="text-xs">{c.businessDate}</TD>
                      <TD className="text-end font-semibold text-slate-700">{c.carsCount}</TD>
                      <TD className="text-end text-emerald-700 font-medium">{formatCurrency(piastresToEgp(c.commissionTotal), settings.currency)}</TD>
                      <TD className="text-end font-bold">{formatCurrency(piastresToEgp(c.netDue), settings.currency)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        {/* Ledger & Transactions log */}
        <Card className="lg:col-span-2">
          <CardHeader title="دفتر التسويات المالية والسحوبات" />
          <CardBody className="p-0">
            {monthWithdrawals.length === 0 ? (
              <div className="p-6">
                <EmptyState title="لا توجد حركات مالية" description="لم يتم تسجيل سلف، مكافآت أو خصومات هذا الشهر." />
              </div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>التاريخ</TH>
                    <TH>نوع المعاملة</TH>
                    <TH>البيان / السبب</TH>
                    <TH className="text-end">القيمة</TH>
                    <TH className="text-end w-16">إجراء</TH>
                  </TR>
                </THead>
                <TBody>
                  {monthWithdrawals.map((w) => {
                    const isBonus = w.amount < 0;
                    const isDeduction = w.amount > 0 && (w.reason?.startsWith("خصم:") || w.reason?.startsWith("جزاء:"));
                    const cleanReason = w.reason?.replace(/^(سحب:|خصم:|بونص:)\s*/, "") || "بدون بيان";

                    let typeBadge = <Badge tone="amber">سلفة / سحب</Badge>;
                    if (isBonus) {
                      typeBadge = <Badge tone="green">مكافأة / بونص</Badge>;
                    } else if (isDeduction) {
                      typeBadge = <Badge tone="rose">خصم / جزاء</Badge>;
                    }

                    return (
                      <TR key={w.id}>
                        <TD className="text-xs whitespace-nowrap">{w.businessDate}</TD>
                        <TD>{typeBadge}</TD>
                        <TD className="text-slate-700 max-w-[16rem] truncate" title={w.reason ?? ""}>
                          {cleanReason}
                        </TD>
                        <TD className={`text-end font-semibold ${isBonus ? "text-emerald-700" : isDeduction ? "text-rose-700" : "text-amber-700"}`}>
                          {isBonus ? "+" : "-"}
                          {formatCurrency(piastresToEgp(Math.abs(w.amount)), settings.currency)}
                        </TD>
                        <TD className="text-end">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => handleDeleteTxn(w.id)}
                            title="حذف الحركة"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </TD>
                      </TR>
                    );
                  })}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {/* Financial transaction Dialog */}
      <Dialog
        open={txnOpen}
        onClose={() => setTxnOpen(false)}
        title={`تسجيل حركة مالية - ${worker.name}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setTxnOpen(false)} disabled={txnSaving}>
              إلغاء
            </Button>
            <Button onClick={handleAddTxn} loading={txnSaving} disabled={txnSaving}>
              حفظ الحركة
            </Button>
          </>
        }
      >
        <div className="space-y-4 text-start" dir="rtl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="نوع الحركة المالية" required>
              <Select
                value={txnType}
                onChange={(e) => setTxnType(e.target.value as "advance" | "deduction" | "bonus")}
              >
                <option value="advance">سحوبات / سلف نقداً</option>
                <option value="deduction">خصم / جزاء تأخير أو إهمال</option>
                <option value="bonus">مكافأة / بونص تشجيعي</option>
              </Select>
            </Field>
            <Field label="التاريخ" required>
              <Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="المبلغ (جنيه)" required>
              <Input
                type="number"
                min="0.5"
                step="0.5"
                placeholder="0.00"
                value={txnAmount}
                onChange={(e) => setTxnAmount(e.target.value)}
              />
            </Field>
            <Field label="البيان / تفاصيل السبب" required>
              <Input
                placeholder="السبب بالتفصيل..."
                value={txnReason}
                onChange={(e) => setTxnReason(e.target.value)}
              />
            </Field>
          </div>
        </div>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "rose" | "slate";
  highlight?: boolean;
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    rose: "bg-rose-50 text-rose-700 border-rose-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 bg-white shadow-sm transition-all ${
        highlight ? "ring-2 ring-brand-500/10 border-brand-200" : "border-slate-200"
      }`}
    >
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]} border`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className={`mt-1 font-semibold ${highlight ? "text-lg text-brand-700" : "text-base text-slate-900"}`}>
          {value}
        </div>
      </div>
    </div>
  );
}
