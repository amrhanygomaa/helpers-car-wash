import { useCallback, useEffect, useMemo, useState } from "react";
import { DoorClosed, DoorOpen, Wallet } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Field, Input, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { useToast } from "../components/ui/Toast";
import { useAuth } from "../store/AuthContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useSettings } from "../store/SettingsContext";
import { hasPermission } from "../lib/permissions";
import { piastresToEgp, egpToPiastres } from "../lib/money";
import { formatCurrency } from "../lib/format";
import { todayISO, uid } from "../lib/utils";
import { computeDrawerExpected, drawerVariance } from "../lib/shifts";
import { hasDb } from "../db/client";
import { getOpenShift, listShifts, openShift, closeShift, type CashShift } from "../features/shifts/queries";

export function CashShiftPage() {
  const { currentUser } = useAuth();
  const { cashEntries } = useInvoicing();
  const { settings } = useSettings();
  const toast = useToast();
  const currency = settings.currency;
  const branchId = settings.currentBranchId || "branch-main";
  const canManage = hasPermission(currentUser, "cashbox", "view");

  const [open, setOpen] = useState<CashShift | null>(null);
  const [history, setHistory] = useState<CashShift[]>([]);
  const [loading, setLoading] = useState(true);
  const [openDialog, setOpenDialog] = useState(false);
  const [closeDialog, setCloseDialog] = useState(false);
  const [openingFloat, setOpeningFloat] = useState("");
  const [countedCash, setCountedCash] = useState("");
  const [closeNote, setCloseNote] = useState("");

  const reload = useCallback(async () => {
    if (!hasDb()) { setLoading(false); return; }
    setLoading(true);
    try {
      const [cur, hist] = await Promise.all([getOpenShift(branchId), listShifts(branchId)]);
      setOpen(cur);
      setHistory(hist);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => { void reload(); }, [reload]);

  // Live expected drawer cash for the open shift.
  const expectedCash = useMemo(() => {
    if (!open) return 0;
    return computeDrawerExpected(
      piastresToEgp(open.openingFloat),
      cashEntries.map((e) => ({ amount: e.amount, paymentMethod: e.paymentMethod, date: e.date })),
      open.businessDate
    );
  }, [open, cashEntries]);

  // The same cash-only entries feeding expectedCash, kept as a list so the
  // cashier can see which invoices/movements made up the net total.
  const shiftMovements = useMemo(() => {
    if (!open) return [];
    return cashEntries
      .filter((e) => e.date === open.businessDate && (!e.paymentMethod || e.paymentMethod === "cash"))
      .slice()
      .reverse();
  }, [open, cashEntries]);

  const counted = parseFloat(countedCash || "0");
  const variance = drawerVariance(Number.isFinite(counted) ? counted : 0, expectedCash);

  async function confirmOpen() {
    const float = parseFloat(openingFloat || "0");
    if (!Number.isFinite(float) || float < 0) { toast.error("رصيد افتتاحي غير صحيح"); return; }
    try {
      await openShift({
        id: uid("shift"),
        businessDate: todayISO(),
        openedBy: currentUser?.id,
        openingFloat: egpToPiastres(float),
        branchId,
        createdAt: new Date().toISOString(),
      });
      toast.success("تم فتح الوردية");
      setOpenDialog(false);
      setOpeningFloat("");
      await reload();
    } catch {
      toast.error("تعذّر فتح الوردية");
    }
  }

  async function confirmClose() {
    if (!open) return;
    if (!Number.isFinite(counted) || counted < 0) { toast.error("أدخل النقدية المعدودة"); return; }
    try {
      await closeShift({
        id: open.id,
        closedBy: currentUser?.id,
        countedCash: egpToPiastres(counted),
        expectedCash: egpToPiastres(expectedCash),
        variance: egpToPiastres(variance),
        note: closeNote.trim() || undefined,
        closedAt: new Date().toISOString(),
      });
      toast.success("تم إقفال الوردية");
      setCloseDialog(false);
      setCountedCash("");
      setCloseNote("");
      await reload();
    } catch {
      toast.error("تعذّر إقفال الوردية");
    }
  }

  if (!hasDb()) {
    return (
      <>
        <PageHeader title="وردية الخزنة" description="جرد النقدية ومطابقة الدرج" />
        <Card><CardBody><EmptyState icon={<Wallet className="w-5 h-5" />} title="غير متاح" description="هذه الميزة تعمل داخل تطبيق سطح المكتب فقط." /></CardBody></Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="وردية الخزنة"
        description="افتح وردية برصيد افتتاحي، وعند الإقفال اعدّ النقدية الفعلية وقارنها بالمتوقع."
        actions={
          canManage ? (
            open ? (
              <Button onClick={() => setCloseDialog(true)}>
                <DoorClosed className="w-4 h-4" /> إقفال الوردية
              </Button>
            ) : (
              <Button onClick={() => setOpenDialog(true)}>
                <DoorOpen className="w-4 h-4" /> فتح وردية
              </Button>
            )
          ) : null
        }
      />

      {loading ? (
        <Card><CardBody><div className="text-center text-slate-400 text-sm py-6">جارٍ التحميل…</div></CardBody></Card>
      ) : open ? (
        <Card className="mb-4">
          <CardHeader title="الوردية الحالية" subtitle={`فُتحت: ${new Date(open.openedAt).toLocaleString("ar-EG")}`} />
          <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Stat label="الرصيد الافتتاحي" value={formatCurrency(piastresToEgp(open.openingFloat), currency)} tone="slate" />
            <Stat label="المتوقع في الدرج الآن" value={formatCurrency(expectedCash, currency)} tone="blue" />
            <Stat label="صافي حركة النقدية" value={formatCurrency(expectedCash - piastresToEgp(open.openingFloat), currency)} tone="green" />
          </CardBody>
        </Card>
      ) : null}

      {open && (
        <Card className="mb-4">
          <CardHeader title="حركات النقدية في الوردية" subtitle="تفاصيل المبالغ التي كوّنت صافي الحركة أعلاه" />
          <CardBody className="p-0">
            {shiftMovements.length === 0 ? (
              <div className="p-6"><EmptyState title="لا توجد حركات نقدية بعد" /></div>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>الوصف</TH>
                    <TH>النوع</TH>
                    <TH className="text-end">المبلغ</TH>
                  </TR>
                </THead>
                <TBody>
                  {shiftMovements.map((e) => (
                    <TR key={e.id}>
                      <TD>{e.description}</TD>
                      <TD>{cashEntryTypeLabel(e.type)}</TD>
                      <TD className={`text-end font-semibold ${e.amount < 0 ? "text-rose-700" : "text-emerald-700"}`}>
                        {e.amount > 0 ? "+" : ""}{formatCurrency(e.amount, currency)}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardBody>
        </Card>
      )}

      {!loading && !open && (
        <Card className="mb-4">
          <CardBody>
            <EmptyState icon={<DoorOpen className="w-6 h-6" />} title="لا توجد وردية مفتوحة" description="افتح وردية لبدء متابعة درج النقدية." />
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader title="سجل الورديات" subtitle="آخر الورديات المُقفلة ونتيجة الجرد" />
        <CardBody className="p-0">
          {history.length === 0 ? (
            <div className="p-6"><EmptyState title="لا توجد ورديات بعد" /></div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>
                  <TH className="text-end">افتتاحي</TH>
                  <TH className="text-end">متوقع</TH>
                  <TH className="text-end">معدود</TH>
                  <TH className="text-end">الفرق</TH>
                  <TH>الحالة</TH>
                </TR>
              </THead>
              <TBody>
                {history.map((s) => (
                  <TR key={s.id}>
                    <TD>{new Date(s.openedAt).toLocaleString("ar-EG")}</TD>
                    <TD className="text-end">{formatCurrency(piastresToEgp(s.openingFloat), currency)}</TD>
                    <TD className="text-end">{s.expectedCash != null ? formatCurrency(piastresToEgp(s.expectedCash), currency) : "—"}</TD>
                    <TD className="text-end">{s.countedCash != null ? formatCurrency(piastresToEgp(s.countedCash), currency) : "—"}</TD>
                    <TD className="text-end">
                      {s.variance == null ? "—" : (
                        <span className={s.variance === 0 ? "text-emerald-700" : s.variance > 0 ? "text-blue-700" : "text-rose-700"}>
                          {s.variance > 0 ? "+" : ""}{formatCurrency(piastresToEgp(s.variance), currency)}
                        </span>
                      )}
                    </TD>
                    <TD>{s.status === "open" ? <Badge tone="amber">مفتوحة</Badge> : <Badge tone="slate">مقفلة</Badge>}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={openDialog}
        onClose={() => setOpenDialog(false)}
        title="فتح وردية"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>إلغاء</Button>
            <Button onClick={confirmOpen}>فتح</Button>
          </>
        }
      >
        <Field label="الرصيد الافتتاحي في الدرج" required>
          <Input type="number" min={0} step="0.01" value={openingFloat} onChange={(e) => setOpeningFloat(e.target.value)} placeholder="0" autoFocus />
        </Field>
      </Dialog>

      <Dialog
        open={closeDialog}
        onClose={() => setCloseDialog(false)}
        title="إقفال الوردية وجرد الدرج"
        footer={
          <>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>إلغاء</Button>
            <Button onClick={confirmClose}>تأكيد الإقفال</Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-sm">
            <span className="text-slate-500">المتوقع في الدرج</span>
            <span className="font-semibold text-slate-900">{formatCurrency(expectedCash, currency)}</span>
          </div>
          <Field label="النقدية المعدودة فعلياً" required>
            <Input type="number" min={0} step="0.01" value={countedCash} onChange={(e) => setCountedCash(e.target.value)} placeholder="0" autoFocus />
          </Field>
          {countedCash !== "" && (
            <div className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${variance === 0 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : variance > 0 ? "bg-blue-50 border-blue-200 text-blue-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
              <span>{variance === 0 ? "مطابق" : variance > 0 ? "زيادة" : "عجز"}</span>
              <span className="font-bold">{variance > 0 ? "+" : ""}{formatCurrency(variance, currency)}</span>
            </div>
          )}
          <Field label="ملاحظة (اختياري)">
            <Textarea rows={2} value={closeNote} onChange={(e) => setCloseNote(e.target.value)} placeholder="سبب الفرق إن وجد" />
          </Field>
        </div>
      </Dialog>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "slate" | "blue" | "green" }) {
  const tones = { slate: "text-slate-900", blue: "text-blue-700", green: "text-emerald-700" } as const;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-xl font-bold ${tones[tone]}`}>{value}</div>
    </div>
  );
}
