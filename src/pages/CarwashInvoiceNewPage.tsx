import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Plus, Save, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { useCatalog } from "../store/CatalogContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useUsers } from "../store/UsersContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { vehicleLabel } from "./VehiclesPage";
import { formatCurrency } from "../lib/format";
import { todayISO, uid } from "../lib/utils";
import type { InvoiceLine, PaymentMethod, SalesPaymentType } from "../types";

interface ServiceLineDraft {
  id: string;
  serviceId: string;
  employeeId: string;
  quantity: number;
  price: number;
}

/** Shared INV- sequence with product invoices (same localStorage seq key). */
function nextInvoiceNumber(existing: string[]): string {
  const nums = existing
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const currentMax = nums.length ? Math.max(...nums) : 1000;
  const storedMax = parseInt(localStorage.getItem("seq_sales_invoice") || "0", 10);
  return `INV-${Math.max(currentMax, storedMax) + 1}`;
}

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "نقدي" },
  { value: "bank", label: "تحويل بنكي" },
  { value: "vodafone", label: "فودافون كاش" },
  { value: "instapay", label: "إنستا باي" },
  { value: "other", label: "أخرى" },
];

export function CarwashInvoiceNewPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queueId = params.get("queue") ?? "";

  const { customers: allCustomers } = useCatalog();
  const { vehicles, washServices, queueTickets, updateQueueTicket, setQueueStatus } = useCarwash();
  const { salesInvoices, addSalesInvoice } = useInvoicing();
  const { users } = useUsers();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();

  const customers = useMemo(() => allCustomers.filter((c) => !c.archived), [allCustomers]);
  const activeServices = useMemo(() => washServices.filter((s) => s.active), [washServices]);
  const employees = useMemo(() => users.filter((u) => u.role === "employee"), [users]);

  const ticket = useMemo(() => queueTickets.find((t) => t.id === queueId), [queueTickets, queueId]);

  const [invoiceNumber] = useState(() => nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber)));
  const [date, setDate] = useState(todayISO());
  const [customerId, setCustomerId] = useState(() => ticket?.customerId ?? customers[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState(() => ticket?.vehicleId ?? "");
  const [lines, setLines] = useState<ServiceLineDraft[]>([]);
  const [notes, setNotes] = useState("");
  const [paymentType, setPaymentType] = useState<SalesPaymentType>("cash");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [amountReceived, setAmountReceived] = useState<number>(0);
  const [paymentDueDate, setPaymentDueDate] = useState("");

  const customerVehicles = useMemo(
    () => vehicles.filter((v) => v.customerId === customerId && !v.archived),
    [vehicles, customerId]
  );

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + l.price * l.quantity, 0),
    [lines]
  );
  const remainingDue = Math.max(0, total - (paymentType === "cash" ? amountReceived : 0));

  function addLine() {
    const svc = activeServices[0];
    if (!svc) {
      toast.error("لا توجد خدمات مفعّلة — أضف خدمات أولاً");
      return;
    }
    setLines((l) => [
      ...l,
      { id: uid("ln"), serviceId: svc.id, employeeId: "", quantity: 1, price: svc.defaultPrice },
    ]);
  }

  function updateLine(id: string, patch: Partial<ServiceLineDraft>) {
    setLines((l) => l.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }

  function removeLine(id: string) {
    setLines((l) => l.filter((row) => row.id !== id));
  }

  function onServiceChange(id: string, serviceId: string) {
    const svc = activeServices.find((s) => s.id === serviceId);
    updateLine(id, { serviceId, price: svc?.defaultPrice ?? 0 });
  }

  function submit() {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) {
      toast.error("اختر العميل");
      return;
    }
    if (lines.length === 0) {
      toast.error("أضف خدمة واحدة على الأقل");
      return;
    }
    if (lines.some((l) => !l.serviceId || l.quantity <= 0)) {
      toast.error("تحقق من بنود الخدمات");
      return;
    }
    if (amountReceived < 0) {
      toast.error("المبلغ المستلم غير صحيح");
      return;
    }
    if ((paymentType === "account" || remainingDue > 0) && !paymentDueDate) {
      toast.error("حدد تاريخ استحقاق المبلغ المتبقي");
      return;
    }

    const vehicle = vehicles.find((v) => v.id === vehicleId);
    const invLines: InvoiceLine[] = lines.map((l) => {
      const svc = activeServices.find((s) => s.id === l.serviceId)!;
      const employee = employees.find((e) => e.id === l.employeeId);
      return {
        id: uid("sline"),
        productId: "",
        productName: svc.name,
        unit: "خدمة",
        quantity: l.quantity,
        price: l.price,
        subtotal: l.price * l.quantity,
        kind: "service",
        serviceId: svc.id,
        employeeId: employee?.id,
        employeeName: employee?.name,
      };
    });

    const actualCashReceived = paymentType === "cash" ? Math.min(amountReceived, total) : 0;
    const cashOverpayment = paymentType === "cash" ? Math.max(0, amountReceived - total) : 0;
    const effectivePaymentType: SalesPaymentType = remainingDue > 0 ? "account" : paymentType;

    const inv = addSalesInvoice({
      invoiceNumber,
      date,
      customerId,
      customerName: customer.name,
      lines: invLines,
      total,
      amountReceived: actualCashReceived,
      overpayment: cashOverpayment > 0 ? cashOverpayment : undefined,
      paymentType: effectivePaymentType,
      paymentMethod,
      priceType: "retail",
      paymentDueDate: remainingDue > 0 ? paymentDueDate : undefined,
      notes: notes.trim() || undefined,
      createdByUserId: currentUser?.id,
      invoiceKind: "service",
      vehicleId: vehicle?.id,
      vehicleLabel: vehicle ? vehicleLabel(vehicle) : undefined,
      queueId: ticket?.id,
    });

    // Link the queue ticket to the invoice and mark the wash completed.
    if (ticket) {
      updateQueueTicket(ticket.id, { invoiceId: inv.id });
      setQueueStatus(ticket.id, "completed");
    }

    const issuedNum = parseInt(inv.invoiceNumber.replace(/\D/g, ""), 10);
    if (!Number.isNaN(issuedNum)) {
      const storedMax = parseInt(localStorage.getItem("seq_sales_invoice") || "0", 10);
      localStorage.setItem("seq_sales_invoice", Math.max(storedMax, issuedNum).toString());
    }

    toast.success("تم حفظ فاتورة الغسيل", `رقم ${inv.invoiceNumber}`);
    navigate(`/sales/${inv.id}`);
  }

  return (
    <>
      <PageHeader
        title="فاتورة غسيل جديدة"
        description="اختر العميل والمركبة والخدمات — تُخصم خامات الخدمات من المخزون تلقائياً عند الحفظ."
        actions={
          <>
            <Button variant="outline" onClick={() => navigate(-1)}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button onClick={submit}>
              <Save className="w-4 h-4" /> حفظ الفاتورة
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader title="البيانات الأساسية" />
          <CardBody className="grid grid-cols-2 gap-4">
            <Field label="رقم الفاتورة">
              <Input value={invoiceNumber} readOnly className="bg-slate-100 font-mono" />
            </Field>
            <Field label="التاريخ">
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="العميل" required>
              <Select
                value={customerId}
                onChange={(e) => {
                  setCustomerId(e.target.value);
                  setVehicleId("");
                }}
              >
                <option value="" disabled>
                  اختر العميل
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المركبة" hint={customerVehicles.length === 0 ? "لا توجد مركبات لهذا العميل" : undefined}>
              <Select value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                <option value="">— بدون مركبة —</option>
                {customerVehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {vehicleLabel(v)}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="الدفع" />
          <CardBody className="space-y-4">
            <Field label="نوع الدفع">
              <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value as SalesPaymentType)}>
                <option value="cash">نقدي</option>
                <option value="account">آجل</option>
              </Select>
            </Field>
            <Field label="طريقة الدفع">
              <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="المبلغ المستلم">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={amountReceived}
                disabled={paymentType === "account"}
                onChange={(e) => setAmountReceived(Number(e.target.value))}
              />
            </Field>
            {remainingDue > 0 ? (
              <Field label="تاريخ استحقاق المتبقي" required>
                <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
              </Field>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="الخدمات"
          actions={
            <Button variant="outline" size="sm" onClick={addLine}>
              <Plus className="w-4 h-4" /> إضافة خدمة
            </Button>
          }
        />
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الخدمة</TH>
                <TH>الموظف المنفّذ</TH>
                <TH className="w-24">الكمية</TH>
                <TH className="w-32">السعر</TH>
                <TH className="w-32 text-end">الإجمالي</TH>
                <TH className="w-12"></TH>
              </TR>
            </THead>
            <TBody>
              {lines.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center py-8 text-slate-500">
                    لم تتم إضافة خدمات بعد
                  </TD>
                </TR>
              ) : (
                lines.map((l) => (
                  <TR key={l.id}>
                    <TD>
                      <Select value={l.serviceId} onChange={(e) => onServiceChange(l.id, e.target.value)}>
                        {activeServices.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <Select value={l.employeeId} onChange={(e) => updateLine(l.id, { employeeId: e.target.value })}>
                        <option value="">— غير محدد —</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name}
                          </option>
                        ))}
                      </Select>
                    </TD>
                    <TD>
                      <Input
                        type="number"
                        min={1}
                        value={l.quantity}
                        onChange={(e) => updateLine(l.id, { quantity: Number(e.target.value) })}
                      />
                    </TD>
                    <TD>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={l.price}
                        onChange={(e) => updateLine(l.id, { price: Number(e.target.value) })}
                      />
                    </TD>
                    <TD className="text-end font-medium">
                      {formatCurrency(l.price * l.quantity, settings.currency)}
                    </TD>
                    <TD>
                      <button
                        onClick={() => removeLine(l.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardBody>
            <Field label="ملاحظات">
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </CardBody>
        </Card>
        <Card>
          <CardBody className="space-y-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">الإجمالي</span>
              <span className="text-lg font-bold text-slate-900">{formatCurrency(total, settings.currency)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">المتبقي</span>
              <span className="font-semibold text-amber-700">{formatCurrency(remainingDue, settings.currency)}</span>
            </div>
          </CardBody>
        </Card>
      </div>
    </>
  );
}
