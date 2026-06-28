import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Ban, HandCoins, MessageCircle, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useReporting } from "../store/ReportingContext";
import { lineWorkers } from "../store/_pure";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from "../lib/format";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import type { PaymentMethod } from "../types";
import { printServiceInvoice } from "../lib/print";
import { hasPermission } from "../lib/permissions";

export function SalesInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { salesInvoices, recordSalesReceipt, cancelSalesInvoice, deleteSalesInvoice } = useInvoicing();
  const { customers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const { customerBalance } = useReporting();
  const inv = salesInvoices.find((s) => s.id === id);
  const canReceiveSales = hasPermission(currentUser, "salesInvoices", "receive");
  const canCancelSales = hasPermission(currentUser, "salesInvoices", "cancel");
  const canDeleteSales = hasPermission(currentUser, "salesInvoices", "delete");
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [payNotes, setPayNotes] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  if (!inv) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <div className="text-slate-900 font-medium">الفاتورة غير موجودة</div>
            <Button className="mt-4" onClick={() => navigate("/sales")}>
              العودة للقائمة
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const customer = customers.find((c) => c.id === inv.customerId);
  const totalCustomerBalance = customerBalance(inv.customerId);
  const totalCollected = inv.amountReceived + (inv.overpayment ?? 0);
  const dueDatePassed = (() => {
    if (!inv.paymentDueDate || inv.remaining <= 0) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(inv.paymentDueDate);
    due.setHours(0, 0, 0, 0);
    return due.getTime() < today.getTime();
  })();

  return (
    <>
      <PageHeader
        title={`فاتورة غسيل ${inv.invoiceNumber}`}
        description={`${inv.customerName} • ${formatDate(inv.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/sales")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const result = printServiceInvoice({
                  invoice: inv,
                  businessName: settings.companyName ?? "Top Gear",
                  currency: settings.currency,
                });
                if (!result.ok && result.error !== "cancelled") {
                  toast.error("تعذر الطباعة", "تأكد من إعدادات الطابعة وحاول مرة أخرى");
                }
              }}
            >
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            {customer?.phone ? (
              <Button
                variant="outline"
                onClick={() => {
                  const phone = String(customer.phone ?? "").replace(/\D/g, "");
                  const normalized = phone.startsWith("0") ? `20${phone.slice(1)}` : phone;
                  const msg = [
                    `مرحباً ${inv.customerName}،`,
                    ``,
                    `تفاصيل فاتورة الغسيل رقم *${inv.invoiceNumber}*:`,
                    `📅 التاريخ: ${formatDate(inv.date)}`,
                    `💰 الإجمالي: ${formatCurrency(inv.total, settings.currency)}`,
                    inv.remaining > 0 ? `⏳ المتبقي: ${formatCurrency(inv.remaining, settings.currency)}` : `✅ الفاتورة مسددة بالكامل`,
                    ``,
                    settings.companyNameAr || settings.companyName,
                  ].join("\n");
                  const href = `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
                  window.open(href, "_blank");
                }}
              >
                <MessageCircle className="w-4 h-4" /> واتساب
              </Button>
            ) : null}
            {!inv.cancelled && inv.remaining > 0 && canReceiveSales ? (
              <Button onClick={() => { setPayAmount(inv.remaining); setPayOpen(true); }}>
                <HandCoins className="w-4 h-4" /> تسجيل دفعة
              </Button>
            ) : null}
            {!inv.cancelled && canCancelSales ? (
              <Button variant="outline" onClick={() => setCancelOpen(true)}>
                <Ban className="w-4 h-4" /> إلغاء
              </Button>
            ) : null}
            {canDeleteSales ? (
              <Button variant="danger" onClick={() => setDelOpen(true)}>
                <Trash2 className="w-4 h-4" /> حذف
              </Button>
            ) : null}
          </>
        }
      />

      {inv.cancelled ? (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
          هذه الفاتورة ملغاة.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {/* 1. Invoice total */}
        <Stat
          label={inv.discount && inv.discount > 0 ? "الإجمالي قبل الخصم" : "الإجمالي"}
          value={formatCurrency(inv.discount && inv.discount > 0 ? inv.total + inv.discount : inv.total, settings.currency)}
        />
        {inv.discount && inv.discount > 0 ? (
          <Stat label="الخصم" value={`- ${formatCurrency(inv.discount, settings.currency)}`} tone="green" />
        ) : null}
        {inv.discount && inv.discount > 0 ? (
          <Stat label="الإجمالي بعد الخصم" value={formatCurrency(inv.total, settings.currency)} />
        ) : null}
        <Stat label="المبلغ المدفوع" value={formatCurrency(inv.amountReceived, settings.currency)} tone="green" />
        <Stat label="المتبقي" value={formatCurrency(inv.remaining, settings.currency)} tone={inv.remaining > 0 ? "amber" : "slate"} />
        {(inv.overpayment ?? 0) > 0 ? (
          <Stat label="رصيد دائن للعميل" value={formatCurrency(inv.overpayment!, settings.currency)} tone="blue" />
        ) : null}
        <Stat
          label="الحالة"
          value={
            inv.cancelled ? "ملغاة"
            : inv.status === "paid" && (inv.overpayment ?? 0) > 0 ? "مسددة بزيادة"
            : inv.status === "paid" ? "مسددة"
            : inv.status === "partial" ? "جزئي"
            : "غير مسددة"
          }
          tone={
            inv.cancelled ? "slate"
            : inv.status === "paid" && (inv.overpayment ?? 0) > 0 ? "blue"
            : inv.status === "paid" ? "green"
            : inv.status === "partial" ? "amber"
            : "red"
          }
        />
        {inv.paymentDueDate ? (
          <Stat
            label="تاريخ الاستحقاق"
            value={formatDate(inv.paymentDueDate)}
            tone={dueDatePassed ? "red" : "slate"}
          />
        ) : null}
        {/* 6. Total customer balance across all invoices */}
        <Stat
          label={`إجمالي رصيد ${inv.customerName}`}
          value={
            totalCustomerBalance > 0
              ? `مديون: ${formatCurrency(totalCustomerBalance, settings.currency)}`
              : totalCustomerBalance < 0
                ? `رصيد دائن: ${formatCurrency(-totalCustomerBalance, settings.currency)}`
                : "لا يوجد مستحق"
          }
          tone={totalCustomerBalance > 0 ? "red" : totalCustomerBalance < 0 ? "blue" : "slate"}
        />
      </div>
      {/* Credit balance notice when return creates credit */}
      {(inv.overpayment ?? 0) > 0 && !inv.cancelled && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
          <span className="font-semibold">رصيد دائن: </span>
          للعميل <strong>{inv.customerName}</strong> رصيد دائن من هذه الفاتورة بقيمة{" "}
          <strong>{formatCurrency(inv.overpayment!, settings.currency)}</strong> — يمكن استخدامه في فواتير قادمة أو استرداده نقداً.
        </div>
      )}

      <Card>
        <CardHeader title="تفاصيل العميل والفاتورة" />
        <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Info label="العميل">{inv.customerName}</Info>
          <Info label="هاتف العميل">{customer?.phone ?? "—"}</Info>
          {inv.vehicleLabel ? (
            <Info label="المركبة">{inv.vehicleLabel}</Info>
          ) : (
            <Info label="السائق">{inv.driverName ?? "—"}</Info>
          )}
          <Info label="طريقة الدفع">
            <Badge tone={inv.paymentType === "cash" ? "emerald" : "indigo"}>
              {inv.paymentType === "cash" ? "نقدي" : "آجل"}
            </Badge>
          </Info>
          {inv.notes ? (
            <Info label="ملاحظات" className="col-span-2 md:col-span-4">
              {inv.notes}
            </Info>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="بنود الفاتورة" />
        <CardBody>
          <Table>
            <THead>
              <TR>
                <TH className="w-10">#</TH>
                <TH>الخدمة / المنتج</TH>
                <TH>الوحدة</TH>
                <TH className="text-end">الكمية</TH>
                <TH className="text-end">السعر</TH>
                <TH className="text-end">الإجمالي</TH>
              </TR>
            </THead>
            <TBody>
              {inv.lines.map((l, idx) => (
                <TR key={l.id}>
                  <TD>{idx + 1}</TD>
                  <TD className="font-medium text-slate-900">
                    {l.productName}
                    {(() => {
                      const workers = lineWorkers(l);
                      if (workers.length === 0) return null;
                      return (
                        <span className="block text-xs font-normal text-slate-500">
                          {workers.length === 1 ? "الصنايعي: " : "الصنايعية: "}
                          {workers
                            .map((w) => `${w.workerName ?? "صنايعي"}${w.commissionAmount ? ` (${formatCurrency(w.commissionAmount, settings.currency)})` : ""}`)
                            .join("، ")}
                        </span>
                      );
                    })()}
                  </TD>
                  <TD>{l.unit}</TD>
                  <TD className="text-end">{l.quantity}</TD>
                  <TD className="text-end">{formatCurrency(l.price, settings.currency)}</TD>
                  <TD className="text-end font-medium">
                    {formatCurrency(l.subtotal, settings.currency)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      {inv.paymentLog && inv.paymentLog.length > 0 ? (
        <Card>
          <CardHeader title="سجل سداد الدفعات" />
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH className="w-10">#</TH>
                  <TH>التاريخ</TH>
                  <TH>وسيلة الدفع</TH>
                  <TH className="text-end">المبلغ</TH>
                  <TH>ملاحظات</TH>
                </TR>
              </THead>
              <TBody>
                {inv.paymentLog.map((entry, idx) => (
                  <TR key={entry.id}>
                    <TD>{idx + 1}</TD>
                    <TD>{formatDate(entry.date)}</TD>
                    <TD>{PAYMENT_METHOD_LABELS[entry.paymentMethod] ?? entry.paymentMethod}</TD>
                    <TD className="text-end font-semibold text-emerald-700">{formatCurrency(entry.amount, settings.currency)}</TD>
                    <TD className="text-xs text-slate-500">{entry.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="تسجيل دفعة"
        subtitle={`المتبقي: ${formatCurrency(inv.remaining, settings.currency)} — الدفع الزائد يُسجَّل رصيداً دائناً`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => {
                if (payAmount <= 0) {
                  toast.error("المبلغ يجب أن يكون أكبر من صفر");
                  return;
                }
                recordSalesReceipt(inv.id, payAmount, paymentMethod, payNotes);
                const msg = payAmount > inv.remaining
                  ? `تم التسجيل — رصيد دائن: ${formatCurrency(payAmount - inv.remaining, settings.currency)}`
                  : "تم تسجيل الدفعة";
                toast.success(msg);
                setPayOpen(false);
                setPaymentMethod("cash");
                setPayNotes("");
              }}
            >
              تسجيل
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="المبلغ" required>
            <Input
              type="number"
              min={0.01}
              step="0.01"
              value={payAmount}
              onChange={(e) => setPayAmount(Number(e.target.value))}
            />
          </Field>
          <Field label="وسيلة الدفع">
            <Select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </Field>
          <Field label="ملاحظات (اختياري)">
            <Textarea rows={2} value={payNotes} onChange={(e) => setPayNotes(e.target.value)} placeholder="مثل: تحويل بنكي رقم ..." />
          </Field>
        </div>
      </Dialog>

      {totalCollected > 0 ? (
        <Dialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          title="إلغاء الفاتورة"
          subtitle={`المُحصَّل: ${formatCurrency(totalCollected, settings.currency)}`}
          width="sm"
          footer={
            <>
              <Button variant="outline" onClick={() => setCancelOpen(false)}>
                تراجع
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  cancelSalesInvoice(inv.id, "credit");
                  setCancelOpen(false);
                  toast.success("تم إلغاء الفاتورة", "تم تحويل المبلغ رصيداً دائناً للعميل");
                }}
              >
                تحويل رصيد دائن
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  cancelSalesInvoice(inv.id, "cash");
                  setCancelOpen(false);
                  toast.success("تم إلغاء الفاتورة", "تم ردّ النقدية للعميل");
                }}
              >
                ردّ نقدي
              </Button>
            </>
          }
        >
          <div className="text-sm text-slate-700 mb-3">
            هذه الفاتورة عليها مبلغ مُحصَّل. كيف تريد معالجة المبلغ؟
          </div>
          <div className="space-y-2">
            <div className="p-3 rounded-lg border border-slate-200 text-sm">
              <div className="font-medium text-slate-900">ردّ نقدي</div>
              <div className="text-slate-500 text-xs mt-0.5">يُخصم المبلغ من الخزنة فوراً ويُسجَّل قيد ردّ نقدي</div>
            </div>
            <div className="p-3 rounded-lg border border-slate-200 text-sm">
              <div className="font-medium text-slate-900">تحويل رصيد دائن</div>
              <div className="text-slate-500 text-xs mt-0.5">يبقى المبلغ بالخزنة كرصيد للعميل يُستخدم في الفواتير القادمة</div>
            </div>
          </div>
        </Dialog>
      ) : (
        <ConfirmDialog
          open={cancelOpen}
          onClose={() => setCancelOpen(false)}
          onConfirm={() => {
            cancelSalesInvoice(inv.id);
            setCancelOpen(false);
            toast.success("تم إلغاء الفاتورة");
          }}
          title="إلغاء الفاتورة"
          message="هل أنت متأكد من إلغاء هذه الفاتورة؟"
          variant="danger"
          confirmText="تأكيد الإلغاء"
        />
      )}

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => {
          const ok = deleteSalesInvoice(inv.id);
          if (ok) {
            toast.success("تم الحذف");
            navigate("/sales");
          } else toast.error("تعذر الحذف");
        }}
        title="حذف نهائي"
        message="هذا الإجراء لا يمكن التراجع عنه. متابعة؟"
        variant="danger"
        confirmText="حذف نهائي"
      />

    </>
  );
}

function Info({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-slate-50 border border-slate-100 rounded-lg p-3 ${className ?? ""}`}>
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 mt-1">{children}</div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "slate",
}: {
  label: string;
  value: string;
  tone?: "slate" | "green" | "amber" | "red" | "blue";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-rose-700",
    blue: "text-blue-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}
