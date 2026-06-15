import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, HandCoins, Pencil, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate, PAYMENT_METHOD_LABELS } from "../lib/format";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../components/ui/Input";
import type { PaymentMethod } from "../types";
import { PurchaseReturnDialog } from "../features/returns/PurchaseReturnDialog";
import { printAppRoute } from "../lib/print";
import { hasPermission } from "../lib/permissions";

export function PurchaseInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { purchaseInvoices, purchaseReturns, recordPurchasePayment, deletePurchaseInvoice } = useInvoicing();
  const { suppliers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const inv = purchaseInvoices.find((s) => s.id === id);
  const canEditPurchase = hasPermission(currentUser, "purchaseInvoices", "edit");
  const canPayPurchase = hasPermission(currentUser, "purchaseInvoices", "pay");
  const canDeletePurchase = hasPermission(currentUser, "purchaseInvoices", "delete");
  const canAddReturn = hasPermission(currentUser, "returns", "add");
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [payNotes, setPayNotes] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

  if (!inv) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <div className="text-slate-900 font-medium">الفاتورة غير موجودة</div>
            <Button className="mt-4" onClick={() => navigate("/purchases")}>
              العودة للقائمة
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const supplier = suppliers.find((s) => s.id === inv.supplierId);
  const linkedReturns = purchaseReturns.filter((r) => r.originalInvoiceId === inv.id);
  // inv.total holds the NET (after returns). Reconstruct the original order total.
  const returnsTotal = linkedReturns.reduce((sum, r) => sum + r.total, 0);
  const originalTotal = inv.total + returnsTotal;
  const canCreateReturn = canAddReturn && inv.lines.some((line) => line.quantity > 0);

  return (
    <>
      <PageHeader
        title={`فاتورة مشتريات ${inv.invoiceNumber}`}
        description={`${inv.supplierName} • ${formatDate(inv.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/purchases")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const result = await printAppRoute(`/purchases/${inv.id}/print`);
                if (!result.ok && result.error !== "cancelled") {
                  toast.error("تعذر الطباعة", "تأكد من إعدادات الطابعة وحاول مرة أخرى");
                }
              }}
            >
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            {canEditPurchase ? (
              <Link to={`/purchases/${inv.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="w-4 h-4" /> تعديل
                </Button>
              </Link>
            ) : null}
            {inv.remaining > 0 && canPayPurchase ? (
              <Button onClick={() => { setPayAmount(inv.remaining); setPayOpen(true); }}>
                <HandCoins className="w-4 h-4" /> تسجيل دفعة
              </Button>
            ) : null}
            {canCreateReturn ? (
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                <ArrowRight className="w-4 h-4" /> إنشاء مرتجع
              </Button>
            ) : null}
            {canDeletePurchase ? (
              <Button variant="danger" onClick={() => setDelOpen(true)}>
                <Trash2 className="w-4 h-4" /> حذف
              </Button>
            ) : null}
          </>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {returnsTotal > 0 ? (
          <>
            <Stat label="إجمالي الفاتورة" value={formatCurrency(originalTotal, settings.currency)} />
            <Stat label="الإجمالي بعد المرتجعات" value={formatCurrency(inv.total, settings.currency)} tone="amber" />
          </>
        ) : (
          <Stat label="الإجمالي" value={formatCurrency(inv.total, settings.currency)} />
        )}
        <Stat label="المدفوع" value={formatCurrency(inv.amountPaid, settings.currency)} tone="green" />
        <Stat label="المتبقي" value={formatCurrency(inv.remaining, settings.currency)} tone={inv.remaining > 0 ? "amber" : "slate"} />
        {inv.overpayment && inv.overpayment > 0 ? (
          <Stat label="رصيد دائن لدى المورد" value={formatCurrency(inv.overpayment, settings.currency)} tone="green" />
        ) : null}
        <Stat label="الحالة" value={inv.status === "paid" ? "مسددة" : inv.status === "partial" ? "جزئي" : "غير مسددة"} tone={inv.status === "paid" ? "green" : inv.status === "partial" ? "amber" : "red"} />
      </div>

      <Card>
        <CardHeader title="تفاصيل المورد والفاتورة" />
        <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Info label="المورد">{inv.supplierName}</Info>
          <Info label="هاتف المورد">{supplier?.phone ?? "—"}</Info>
          <Info label="عدد البنود">{inv.lines.length}</Info>
          <Info label="الحالة">
            <Badge
              tone={inv.status === "paid" ? "green" : inv.status === "partial" ? "amber" : "red"}
            >
              {inv.status === "paid" ? "مسدد" : inv.status === "partial" ? "جزئي" : "غير مسدد"}
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
                <TH>المنتج</TH>
                <TH>الوحدة</TH>
                <TH className="text-end">الكمية</TH>
                <TH className="text-end">السعر</TH>
                <TH>الصلاحية</TH>
                <TH className="text-end">الإجمالي</TH>
              </TR>
            </THead>
            <TBody>
              {inv.lines.map((l, idx) => (
                <TR key={l.id}>
                  <TD>{idx + 1}</TD>
                  <TD className="font-medium text-slate-900">{l.productName}</TD>
                  <TD>{l.unit}</TD>
                  <TD className="text-end">{l.quantity}</TD>
                  <TD className="text-end">{formatCurrency(l.price, settings.currency)}</TD>
                  <TD className="text-xs text-slate-600">{l.expiryDate ? formatDate(l.expiryDate) : "—"}</TD>
                  <TD className="text-end font-medium">
                    {formatCurrency(l.subtotal, settings.currency)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      {linkedReturns.length > 0 ? (
        <Card>
          <CardHeader title="المرتجعات المرتبطة بهذه الفاتورة" />
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>رقم المرتجع</TH>
                  <TH>التاريخ</TH>
                  <TH>الأصناف</TH>
                  <TH className="text-end">قيمة المرتجع</TH>
                </TR>
              </THead>
              <TBody>
                {linkedReturns.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-mono text-xs text-slate-600">{r.returnNumber}</TD>
                    <TD>{formatDate(r.date)}</TD>
                    <TD>
                      <ul className="space-y-0.5">
                        {r.lines.map((l) => (
                          <li key={l.id} className="text-xs text-slate-700">
                            {l.productName} × {l.quantity} {l.unit}
                          </li>
                        ))}
                      </ul>
                    </TD>
                    <TD className="text-end font-semibold text-rose-700">
                      {formatCurrency(r.total, settings.currency)}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

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
                    <TD className="text-end font-semibold text-emerald-700">
                      {formatCurrency(entry.amount, settings.currency)}
                    </TD>
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
        title="تسجيل دفعة للمورد"
        subtitle={`المتبقي: ${formatCurrency(inv.remaining, settings.currency)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setPayOpen(false)}>إلغاء</Button>
            <Button
              onClick={() => {
                if (payAmount <= 0 || payAmount > inv.remaining) {
                  toast.error("المبلغ غير صحيح");
                  return;
                }
                recordPurchasePayment(inv.id, payAmount, paymentMethod, payNotes);
                toast.success("تم تسجيل الدفعة");
                setPayOpen(false);
                setPayAmount(0);
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
              max={inv.remaining}
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
            <Textarea
              rows={2}
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="مثل: تحويل بنكي رقم ..."
            />
          </Field>
        </div>
      </Dialog>

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => {
          const ok = deletePurchaseInvoice(inv.id);
          if (ok) {
            toast.success("تم الحذف", "وتم عكس الكميات من المخزون");
            navigate("/purchases");
          } else toast.error("تعذر الحذف");
        }}
        title="حذف نهائي"
        message="سيتم حذف الفاتورة وعكس تأثيرها على المخزون. متابعة؟"
        variant="danger"
        confirmText="حذف نهائي"
      />

      {returnOpen && (
        <PurchaseReturnDialog
          open={returnOpen}
          onClose={() => setReturnOpen(false)}
          invoice={inv}
        />
      )}
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
  tone?: "slate" | "green" | "amber" | "red";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    red: "text-rose-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}
