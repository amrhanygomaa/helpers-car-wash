import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  HandCoins,
  NotebookPen,
  Pencil,
  Plus,
  Save,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { hasDb } from "../db/client";
import {
  listDailyClosuresForDate,
  upsertDailyClosures,
  type DailyClosure,
} from "../features/payroll/queries";
import { calcDayCloseRows } from "../features/payroll/compute";
import {
  recordTreasuryExpense,
  recordWorkerWithdrawal,
  listTreasuryEntriesForDate,
  listWorkerWithdrawalsForDate,
  type TreasuryEntry,
  type WorkerWithdrawal,
} from "../features/treasury/queries";
import {
  createWorker,
  listAllWorkers,
  updateWorker,
  type WageType,
  type Worker,
} from "../features/workers/queries";
import { egpToPiastres, formatPiastres, piastresToEgp } from "../lib/money";
import { hasPermissionKey } from "../lib/permissions";
import { formatDate } from "../lib/format";
import { todayISO, uid } from "../lib/utils";
import { useAuth } from "../store/AuthContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";

const WAGE_LABELS: Record<WageType, string> = {
  daily_fixed: "يومي ثابت",
  monthly: "شهري",
  commission_only: "عمولة فقط",
};

function workerName(workers: Worker[], workerId?: string | null): string {
  if (!workerId) return "—";
  return workers.find((w) => w.id === workerId)?.name ?? "عامل غير موجود";
}

function Stat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "rose" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    slate: "bg-slate-100 text-slate-700",
  };
  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}

function WorkerForm({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: Worker | null;
  onClose: () => void;
  onSave: (data: { name: string; wageType: WageType; baseWage: number | null }) => void;
}) {
  const [name, setName] = useState("");
  const [wageType, setWageType] = useState<WageType>("daily_fixed");
  const [baseWage, setBaseWage] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setWageType(initial?.wageType ?? "daily_fixed");
    setBaseWage(initial?.baseWage != null ? piastresToEgp(initial.baseWage).toString() : "");
  }, [open, initial]);

  function submit() {
    const amount = baseWage.trim() ? egpToPiastres(baseWage) : null;
    if (!name.trim()) return;
    if (amount != null && amount < 0) return;
    onSave({ name: name.trim(), wageType, baseWage: amount });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initial ? "تعديل عامل" : "عامل جديد"}>
      <div className="space-y-4">
        <Field label="اسم العامل" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="نظام الأجر" required>
          <Select value={wageType} onChange={(e) => setWageType(e.target.value as WageType)}>
            {Object.entries(WAGE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="الأجر الأساسي"
          hint={wageType === "monthly" ? "يتم تقسيمه على عدد أيام الشهر في قفلة اليوم." : "اتركه فارغاً لو العامل عمولة فقط."}
        >
          <Input
            type="number"
            min={0}
            step="0.5"
            value={baseWage}
            onChange={(e) => setBaseWage(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={!name.trim()}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function ExpenseDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (amount: number, description: string) => void;
}) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setAmount("");
    setDescription("");
  }, [open]);

  function submit() {
    const piastres = egpToPiastres(amount);
    if (piastres <= 0 || !description.trim()) return;
    onSave(piastres, description.trim());
  }

  return (
    <Dialog open={open} onClose={onClose} title="تسجيل مصروف">
      <div className="space-y-4">
        <Field label="المبلغ" required>
          <Input type="number" min={0.5} step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="البيان" required>
          <Textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="مثال: كهرباء، إيجار، صابون..."
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={egpToPiastres(amount) <= 0 || !description.trim()}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

function WithdrawalDialog({
  open,
  workers,
  onClose,
  onSave,
}: {
  open: boolean;
  workers: Worker[];
  onClose: () => void;
  onSave: (workerId: string, amount: number, reason: string) => void;
}) {
  const [workerId, setWorkerId] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setWorkerId(workers[0]?.id ?? "");
    setAmount("");
    setReason("");
  }, [open, workers]);

  function submit() {
    const piastres = egpToPiastres(amount);
    if (!workerId || piastres <= 0) return;
    onSave(workerId, piastres, reason.trim() || "سحب عامل");
  }

  return (
    <Dialog open={open} onClose={onClose} title="تسجيل سحب عامل">
      <div className="space-y-4">
        <Field label="العامل" required>
          <Select value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            {workers.map((worker) => (
              <option key={worker.id} value={worker.id}>
                {worker.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="المبلغ" required>
          <Input type="number" min={0.5} step="0.5" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="السبب">
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="خارجية / سلفة / سحب يومي" />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={!workerId || egpToPiastres(amount) <= 0}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function PayrollDayClosePage() {
  const { currentUser } = useAuth();
  const { salesInvoices } = useInvoicing();
  const { settings } = useSettings();
  const toast = useToast();
  const branchId = settings.currentBranchId || "branch-main";
  const canManagePayroll = hasPermissionKey(currentUser, "payroll.manage");
  const canManageTreasury = hasPermissionKey(currentUser, "treasury.manage");
  const canManageWorkers = hasPermissionKey(currentUser, "workers.manage");

  const [businessDate, setBusinessDate] = useState(todayISO());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [treasuryEntries, setTreasuryEntries] = useState<TreasuryEntry[]>([]);
  const [withdrawals, setWithdrawals] = useState<WorkerWithdrawal[]>([]);
  const [closures, setClosures] = useState<DailyClosure[]>([]);
  const [loading, setLoading] = useState(true);
  const [workerDialogOpen, setWorkerDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [withdrawalOpen, setWithdrawalOpen] = useState(false);

  const load = useCallback(async () => {
    if (!hasDb()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [allWorkers, entries, dayWithdrawals, dayClosures] = await Promise.all([
        listAllWorkers(),
        listTreasuryEntriesForDate(businessDate, branchId),
        listWorkerWithdrawalsForDate(businessDate, branchId),
        listDailyClosuresForDate(businessDate, branchId),
      ]);
      setWorkers(allWorkers);
      setTreasuryEntries(entries);
      setWithdrawals(dayWithdrawals);
      setClosures(dayClosures);
    } finally {
      setLoading(false);
    }
  }, [businessDate, branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const activeWorkers = useMemo(() => workers.filter((worker) => worker.active), [workers]);
  const dayRows = useMemo(
    () =>
      calcDayCloseRows({
        workers,
        invoices: salesInvoices,
        withdrawals,
        closures,
        businessDate,
      }),
    [workers, salesInvoices, withdrawals, closures, businessDate]
  );

  const totals = useMemo(() => {
    const expenses = treasuryEntries
      .filter((entry) => entry.type === "expense")
      .reduce((sum, entry) => sum + entry.amount, 0);
    const treasuryWithdrawals = treasuryEntries
      .filter((entry) => entry.type === "withdrawal")
      .reduce((sum, entry) => sum + entry.amount, 0);
    return {
      cars: dayRows.reduce((sum, row) => sum + row.carsCount, 0),
      commissions: dayRows.reduce((sum, row) => sum + row.commissionTotal, 0),
      base: dayRows.reduce((sum, row) => sum + row.baseAmount, 0),
      withdrawals: dayRows.reduce((sum, row) => sum + row.withdrawalsTotal, 0),
      netDue: dayRows.reduce((sum, row) => sum + row.netDue, 0),
      expenses,
      treasuryWithdrawals,
    };
  }, [dayRows, treasuryEntries]);

  async function saveWorker(data: { name: string; wageType: WageType; baseWage: number | null }) {
    if (!hasDb()) return;
    try {
      if (editingWorker) {
        await updateWorker(editingWorker.id, data);
        toast.success("تم تحديث العامل");
      } else {
        await createWorker({ id: uid("wrk"), active: true, ...data });
        toast.success("تمت إضافة العامل");
      }
      setWorkerDialogOpen(false);
      setEditingWorker(null);
      load();
    } catch {
      toast.error("حدث خطأ أثناء حفظ العامل");
    }
  }

  async function toggleWorker(worker: Worker) {
    if (!hasDb()) return;
    try {
      await updateWorker(worker.id, { active: !worker.active });
      toast.success(worker.active ? "تم تعطيل العامل" : "تم تفعيل العامل");
      load();
    } catch {
      toast.error("حدث خطأ أثناء تحديث العامل");
    }
  }

  async function saveExpense(amount: number, description: string) {
    try {
      await recordTreasuryExpense({
        id: uid("tre"),
        businessDate,
        amount,
        description,
        branchId,
        createdBy: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      toast.success("تم تسجيل المصروف");
      setExpenseOpen(false);
      load();
    } catch {
      toast.error("حدث خطأ أثناء تسجيل المصروف");
    }
  }

  async function saveWithdrawal(workerId: string, amount: number, reason: string) {
    try {
      await recordWorkerWithdrawal({
        withdrawalId: uid("wd"),
        treasuryEntryId: uid("tre"),
        workerId,
        businessDate,
        amount,
        reason,
        branchId,
        createdBy: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      toast.success("تم تسجيل سحب العامل");
      setWithdrawalOpen(false);
      load();
    } catch {
      toast.error("حدث خطأ أثناء تسجيل السحب");
    }
  }

  async function closeDay() {
    if (!hasDb()) return;
    if (dayRows.length === 0) {
      toast.error("لا يوجد عمال فعالون لإقفال اليوم");
      return;
    }
    const now = new Date().toISOString();
    try {
      await upsertDailyClosures(
        dayRows.map((row) => ({
          id: uid("close"),
          businessDate,
          workerId: row.worker.id,
          branchId,
          carsCount: row.carsCount,
          commissionTotal: row.commissionTotal,
          baseAmount: row.baseAmount,
          withdrawalsTotal: row.withdrawalsTotal,
          netDue: row.netDue,
          closedBy: currentUser?.id,
          closedAt: now,
        }))
      );
      toast.success("تم حفظ قفلة اليوم");
      load();
    } catch {
      toast.error("حدث خطأ أثناء حفظ القفلة");
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-slate-500">جاري التحميل...</div>;
  }

  if (!hasDb()) {
    return (
      <>
        <PageHeader title="قفلة اليوم والعمال" description="حساب الأجور والسحوبات والخزينة." />
        <EmptyState
          icon={<NotebookPen className="h-8 w-8" />}
          title="قاعدة البيانات غير متاحة"
          description="هذه الصفحة تعمل من نسخة سطح المكتب المتصلة بقاعدة البيانات."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="قفلة اليوم والعمال"
        description="مصاريف الخزينة، سحوبات العمال، وحساب صافي المستحق لكل عامل."
        actions={
          <>
            {canManageTreasury ? (
              <>
                <Button variant="outline" onClick={() => setExpenseOpen(true)}>
                  <Plus className="h-4 w-4" /> مصروف
                </Button>
                <Button variant="outline" onClick={() => setWithdrawalOpen(true)} disabled={activeWorkers.length === 0}>
                  <HandCoins className="h-4 w-4" /> سحب عامل
                </Button>
              </>
            ) : null}
            {canManagePayroll ? (
              <Button onClick={closeDay}>
                <Save className="h-4 w-4" /> حفظ قفلة اليوم
              </Button>
            ) : null}
          </>
        }
      />

      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="تاريخ اليوم">
            <Input type="date" value={businessDate} onChange={(e) => setBusinessDate(e.target.value)} />
          </Field>
          <Button variant="outline" onClick={() => setBusinessDate(todayISO())}>
            اليوم
          </Button>
        </CardBody>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-6">
        <Stat icon={<Users className="h-5 w-5" />} label="سيارات منسوبة" value={String(totals.cars)} tone="blue" />
        <Stat icon={<HandCoins className="h-5 w-5" />} label="عمولات" value={formatPiastres(totals.commissions)} tone="green" />
        <Stat icon={<Wallet className="h-5 w-5" />} label="أساسي" value={formatPiastres(totals.base)} tone="slate" />
        <Stat icon={<HandCoins className="h-5 w-5" />} label="سحوبات" value={formatPiastres(totals.withdrawals)} tone="rose" />
        <Stat icon={<Wallet className="h-5 w-5" />} label="صافي مستحق" value={formatPiastres(totals.netDue)} tone={totals.netDue >= 0 ? "green" : "rose"} />
        <Stat icon={<NotebookPen className="h-5 w-5" />} label="مصروفات" value={formatPiastres(totals.expenses)} tone="amber" />
      </div>

      <Card className="mb-4">
        <CardHeader
          title="حساب العمال اليومي"
          subtitle="يُحسب من فواتير الغسيل وخطوط الخدمات المنسوبة لكل عامل."
        />
        <CardBody className="p-0">
          {dayRows.length === 0 ? (
            <EmptyState
              icon={<Users className="h-8 w-8" />}
              title="لا يوجد عمال فعالون"
              description="أضف عامل أو فعّل عامل موجود لحساب قفلة اليوم."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>العامل</TH>
                  <TH>النظام</TH>
                  <TH className="text-end">السيارات</TH>
                  <TH className="text-end">الخدمات</TH>
                  <TH className="text-end">الأساسي</TH>
                  <TH className="text-end">العمولة</TH>
                  <TH className="text-end">السحوبات</TH>
                  <TH className="text-end">الصافي</TH>
                  <TH>الحالة</TH>
                </TR>
              </THead>
              <TBody>
                {dayRows.map((row) => (
                  <TR key={row.worker.id}>
                    <TD className="font-medium text-slate-900">
                      <Link to={`/workers/${row.worker.id}`} className="text-brand-700 hover:underline">
                        {row.worker.name}
                      </Link>
                    </TD>
                    <TD>{WAGE_LABELS[row.worker.wageType]}</TD>
                    <TD className="text-end">{row.carsCount}</TD>
                    <TD className="text-end">{row.servicesCount}</TD>
                    <TD className="text-end">{formatPiastres(row.baseAmount)}</TD>
                    <TD className="text-end text-emerald-700 font-medium">{formatPiastres(row.commissionTotal)}</TD>
                    <TD className="text-end text-rose-700 font-medium">{formatPiastres(row.withdrawalsTotal)}</TD>
                    <TD className={`text-end font-bold ${row.netDue >= 0 ? "text-slate-900" : "text-rose-700"}`}>
                      {formatPiastres(row.netDue)}
                    </TD>
                    <TD>
                      {row.closed ? (
                        <Badge tone="green">محفوظ {formatDate(row.closed.closedAt)}</Badge>
                      ) : (
                        <Badge tone="amber">غير محفوظ</Badge>
                      )}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="دفتر الخزينة اليومي"
            actions={
              canManageTreasury ? (
                <Button size="sm" variant="outline" onClick={() => setExpenseOpen(true)}>
                  <Plus className="h-3.5 w-3.5" /> مصروف
                </Button>
              ) : null
            }
          />
          <CardBody className="p-0">
            {treasuryEntries.length === 0 ? (
              <EmptyState
                icon={<NotebookPen className="h-8 w-8" />}
                title="لا توجد حركات خزينة اليوم"
                description="سجل مصروف أو سحب عامل ليظهر هنا."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>النوع</TH>
                    <TH>البيان</TH>
                    <TH>العامل</TH>
                    <TH className="text-end">المبلغ</TH>
                  </TR>
                </THead>
                <TBody>
                  {treasuryEntries.map((entry) => (
                    <TR key={entry.id}>
                      <TD>
                        <Badge tone={entry.type === "expense" ? "amber" : entry.type === "withdrawal" ? "rose" : "slate"}>
                          {entry.type === "expense" ? "مصروف" : entry.type === "withdrawal" ? "سحب" : "تسوية"}
                        </Badge>
                      </TD>
                      <TD className="text-slate-700">{entry.description}</TD>
                      <TD>{workerName(workers, entry.workerId)}</TD>
                      <TD className="text-end font-medium text-rose-700">-{formatPiastres(entry.amount)}</TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="العمال ونظام الأجر"
            actions={
              canManageWorkers ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingWorker(null);
                    setWorkerDialogOpen(true);
                  }}
                >
                  <Plus className="h-3.5 w-3.5" /> عامل
                </Button>
              ) : null
            }
          />
          <CardBody className="p-0">
            {workers.length === 0 ? (
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="لا يوجد عمال"
                description="أضف العمال ونظام الأجر قبل قفلة اليوم."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>العامل</TH>
                    <TH>نظام الأجر</TH>
                    <TH>الأجر الأساسي</TH>
                    <TH>الحالة</TH>
                    {canManageWorkers ? <TH className="w-24"></TH> : null}
                  </TR>
                </THead>
                <TBody>
                  {workers.map((worker) => (
                    <TR key={worker.id} className={!worker.active ? "text-slate-400" : undefined}>
                      <TD className="font-medium">
                        <Link to={`/workers/${worker.id}`} className="text-brand-700 hover:underline">
                          {worker.name}
                        </Link>
                      </TD>
                      <TD>{WAGE_LABELS[worker.wageType]}</TD>
                      <TD>{worker.baseWage != null ? formatPiastres(worker.baseWage) : "—"}</TD>
                      <TD>
                        <Badge tone={worker.active ? "green" : "slate"}>{worker.active ? "فعال" : "معطل"}</Badge>
                      </TD>
                      {canManageWorkers ? (
                        <TD>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingWorker(worker);
                                setWorkerDialogOpen(true);
                              }}
                              className="p-1.5 text-slate-400 transition-colors hover:text-blue-600"
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleWorker(worker)}
                              className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-500 transition-colors hover:text-slate-800"
                            >
                              {worker.active ? "تعطيل" : "تفعيل"}
                            </button>
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      {totals.netDue < 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>يوجد عامل أو أكثر سحوباته أكبر من مستحقه اليومي؛ سيتم حفظ الصافي بالسالب كرصيد مراجعته مطلوبة.</span>
        </div>
      ) : null}

      <WorkerForm
        open={workerDialogOpen}
        initial={editingWorker}
        onSave={saveWorker}
        onClose={() => {
          setWorkerDialogOpen(false);
          setEditingWorker(null);
        }}
      />
      <ExpenseDialog open={expenseOpen} onClose={() => setExpenseOpen(false)} onSave={saveExpense} />
      <WithdrawalDialog
        open={withdrawalOpen}
        workers={activeWorkers}
        onClose={() => setWithdrawalOpen(false)}
        onSave={saveWithdrawal}
      />
    </>
  );
}
