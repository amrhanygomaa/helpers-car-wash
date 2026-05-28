import { useMemo, useState } from "react";
import { Plus, Minus, Wallet, HandCoins, Factory, NotebookPen, Users, UserRoundMinus } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Field, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { uid } from "../lib/utils";
import type { CashEntryType } from "../types";
import { formatCurrency, formatDate } from "../lib/format";
import { hasPermission } from "../lib/permissions";

export function CashboxPage() {
  const {
    settings,
    cashEntries,
    salesInvoices,
    purchaseInvoices,
    customers,
    suppliers,
    addCashEntry,
    currentCashBalance,
    customerBalance,
    supplierBalance,
    updateSettings,
    currentUser,
  } = useApp();
  const toast = useToast();
  const canAddCash = hasPermission(currentUser, "cashbox", "add");
  const canSpendCash = hasPermission(currentUser, "cashbox", "spend");
  const canEditOpeningBalance = hasPermission(currentUser, "cashbox", "editOpeningBalance");

  const [open, setOpen] = useState(false);
  const [entryType, setEntryType] = useState<CashEntryType>("manual-add");
  const [amount, setAmount] = useState(0);
  const [desc, setDesc] = useState("");

  const [openBalOpen, setOpenBalOpen] = useState(false);
  const [newOpening, setNewOpening] = useState(settings.openingBalance);

  const totalReceived = useMemo(
    () =>
      salesInvoices
        .filter((s) => !s.cancelled)
        .reduce((a, s) => a + s.amountReceived + (s.overpayment ?? 0), 0),
    [salesInvoices]
  );
  const totalPurchasePayments = useMemo(
    () => purchaseInvoices.reduce((a, s) => a + s.amountPaid + (s.overpayment ?? 0), 0),
    [purchaseInvoices]
  );
  const receivables = useMemo(
    () => customers.reduce((a, c) => a + Math.max(0, customerBalance(c.id)), 0),
    [customers, customerBalance]
  );
  const customerCredits = useMemo(
    () => customers.reduce((a, c) => a + Math.max(0, -customerBalance(c.id)), 0),
    [customers, customerBalance]
  );
  const payables = useMemo(
    () => suppliers.reduce((a, s) => a + supplierBalance(s.id), 0),
    [suppliers, supplierBalance]
  );

  function submit() {
    if (amount <= 0) {
      toast.error("المبلغ يجب أن يكون أكبر من صفر");
      return;
    }
    if (!desc.trim()) {
      toast.error("الوصف مطلوب");
      return;
    }
    if (entryType === "manual-add" && !canAddCash) {
      toast.error("ليس لديك صلاحية", "لا تملك صلاحية إضافة نقدية");
      return;
    }
    if (entryType === "manual-remove" && !canSpendCash) {
      toast.error("ليس لديك صلاحية", "لا تملك صلاحية صرف نقدية");
      return;
    }
    if (entryType === "adjustment" && !canAddCash && !canSpendCash) {
      toast.error("ليس لديك صلاحية", "لا تملك صلاحية تسجيل تسوية");
      return;
    }
    const signed = entryType === "manual-add" ? amount : -amount;
    addCashEntry({
      id: uid("cash_m"),
      type: entryType,
      amount: signed,
      description: desc.trim(),
      date: new Date().toISOString().slice(0, 10),
    });
    toast.success(entryType === "manual-add" ? "تم إضافة نقدية" : "تم خصم نقدية");
    setOpen(false);
    setAmount(0);
    setDesc("");
  }

  return (
    <>
      <PageHeader
        title="الخزينة"
        description="رصيد نقدي، إيداعات، صرف، وسجل مالي"
        actions={
          canEditOpeningBalance || canAddCash || canSpendCash ? (
            <>
              {canEditOpeningBalance ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setNewOpening(settings.openingBalance);
                    setOpenBalOpen(true);
                  }}
                >
                  الرصيد الافتتاحي
                </Button>
              ) : null}
              {canAddCash ? (
                <Button
                  onClick={() => {
                    setEntryType("manual-add");
                    setOpen(true);
                  }}
                >
                  <Plus className="w-4 h-4" /> إضافة نقدية
                </Button>
              ) : null}
              {canSpendCash ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setEntryType("manual-remove");
                    setOpen(true);
                  }}
                >
                  <Minus className="w-4 h-4" /> صرف
                </Button>
              ) : null}
            </>
          ) : null
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
        <Stat icon={<Wallet className="w-5 h-5" />} label="الرصيد الحالي" value={formatCurrency(currentCashBalance(), settings.currency)} tone="green" />
        <Stat icon={<HandCoins className="w-5 h-5" />} label="إجمالي المحصل" value={formatCurrency(totalReceived, settings.currency)} tone="blue" />
        <Stat icon={<Factory className="w-5 h-5" />} label="مدفوعات الموردين" value={formatCurrency(totalPurchasePayments, settings.currency)} tone="amber" />
        <Stat icon={<Users className="w-5 h-5" />} label="مستحقات من العملاء" value={formatCurrency(receivables, settings.currency)} tone="rose" />
        <Stat icon={<UserRoundMinus className="w-5 h-5" />} label="فلوس علينا للعملاء" value={formatCurrency(customerCredits, settings.currency)} tone="violet" />
      </div>

      <Card>
        <CardHeader
          title="دفتر الخزينة"
          subtitle={`الرصيد الافتتاحي: ${formatCurrency(settings.openingBalance, settings.currency)} • مستحقات على الموردين: ${formatCurrency(payables, settings.currency)}`}
        />
        <CardBody>
          {cashEntries.length === 0 ? (
            <EmptyState
              icon={<NotebookPen className="w-5 h-5" />}
              title="لا توجد حركات بالخزينة"
              description="سيتم تسجيل كل دفعة تلقائياً هنا."
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>التاريخ</TH>
                  <TH>النوع</TH>
                  <TH>البيان</TH>
                  <TH className="text-end">المبلغ</TH>
                </TR>
              </THead>
              <TBody>
                {cashEntries.slice(0, 100).map((c) => (
                  <TR key={c.id}>
                    <TD>{formatDate(c.date)}</TD>
                    <TD>
                      <TypeBadge type={c.type} />
                    </TD>
                    <TD className="text-slate-700">{c.description}</TD>
                    <TD
                      className={`text-end font-medium ${
                        c.amount >= 0 ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      {c.amount >= 0 ? "+" : ""}
                      {formatCurrency(c.amount, settings.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={entryType === "manual-add" ? "إضافة نقدية" : "صرف"}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
            <Button onClick={submit}>حفظ</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="النوع">
            <Select value={entryType} onChange={(e) => setEntryType(e.target.value as CashEntryType)}>
              {canAddCash ? <option value="manual-add">إضافة نقدية</option> : null}
              {canSpendCash ? <option value="manual-remove">صرف</option> : null}
              {canAddCash || canSpendCash ? <option value="adjustment">تسوية / ملاحظة</option> : null}
            </Select>
          </Field>
          <Field label="المبلغ" required>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={amount || ""}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="البيان" required>
            <Textarea
              rows={2}
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="مثل: إيداع من صاحب المحل، صرف مصاريف..."
            />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={openBalOpen}
        onClose={() => setOpenBalOpen(false)}
        title="تعديل الرصيد الافتتاحي"
        footer={
          <>
            <Button variant="outline" onClick={() => setOpenBalOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => {
                updateSettings({ openingBalance: Math.max(0, newOpening) });
                toast.success("تم تحديث الرصيد الافتتاحي");
                setOpenBalOpen(false);
              }}
            >
              حفظ
            </Button>
          </>
        }
      >
        <Field label="الرصيد الافتتاحي للخزينة">
          <Input type="number" step="0.01" value={newOpening} onChange={(e) => setNewOpening(Number(e.target.value))} />
        </Field>
      </Dialog>
    </>
  );
}

function TypeBadge({ type }: { type: CashEntryType }) {
  if (type === "sales-receipt") return <Badge tone="green">تحصيل مبيعات</Badge>;
  if (type === "purchase-payment") return <Badge tone="blue">سداد مشتريات</Badge>;
  if (type === "manual-add") return <Badge tone="emerald">إضافة يدوية</Badge>;
  if (type === "manual-remove") return <Badge tone="rose">صرف يدوي</Badge>;
  return <Badge tone="amber">تسوية</Badge>;
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
  tone: "green" | "blue" | "amber" | "rose" | "violet";
}) {
  const colors: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700",
    blue: "bg-blue-50 text-blue-700",
    amber: "bg-amber-50 text-amber-700",
    rose: "bg-rose-50 text-rose-700",
    violet: "bg-violet-50 text-violet-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-lg grid place-items-center ${colors[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
