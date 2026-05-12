import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Ban, HandCoins, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Input";
import { SalesReturnDialog } from "../features/returns/SalesReturnDialog";

export function SalesInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const {
    salesInvoices,
    customers,
    settings,
    recordSalesReceipt,
    cancelSalesInvoice,
    deleteSalesInvoice,
  } = useApp();
  const inv = salesInvoices.find((s) => s.id === id);
  const [payOpen, setPayOpen] = useState(false);
  const [payAmount, setPayAmount] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [returnOpen, setReturnOpen] = useState(false);

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

  return (
    <>
      <PageHeader
        title={`فاتورة مبيعات ${inv.invoiceNumber}`}
        description={`${inv.customerName} • ${formatDate(inv.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/sales")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            <Link to={`/sales/${inv.id}/print`} target="_blank">
              <Button variant="outline">
                <Printer className="w-4 h-4" /> طباعة
              </Button>
            </Link>
            {!inv.cancelled && inv.remaining > 0 ? (
              <Button onClick={() => { setPayAmount(inv.remaining); setPayOpen(true); }}>
                <HandCoins className="w-4 h-4" /> تسجيل دفعة
              </Button>
            ) : null}
            {!inv.cancelled ? (
              <>
                <Button variant="outline" onClick={() => setReturnOpen(true)}>
                  <ArrowRight className="w-4 h-4" /> إنشاء مرتجع
                </Button>
                <Button variant="outline" onClick={() => setCancelOpen(true)}>
                  <Ban className="w-4 h-4" /> إلغاء
                </Button>
              </>
            ) : null}
            <Button variant="danger" onClick={() => setDelOpen(true)}>
              <Trash2 className="w-4 h-4" /> حذف
            </Button>
          </>
        }
      />

      {inv.cancelled ? (
        <div className="bg-slate-100 border border-slate-200 rounded-lg p-3 text-sm text-slate-700">
          هذه الفاتورة ملغاة — تم إرجاع الكميات إلى المخزون.
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="الإجمالي" value={formatCurrency(inv.total, settings.currency)} />
        <Stat label="المستلم" value={formatCurrency(inv.amountReceived, settings.currency)} tone="green" />
        <Stat label="المتبقي" value={formatCurrency(inv.remaining, settings.currency)} tone={inv.remaining > 0 ? "amber" : "slate"} />
        <Stat label="الحالة" value={inv.cancelled ? "ملغاة" : inv.status === "paid" ? "مسددة" : inv.status === "partial" ? "جزئي" : "غير مسددة"} tone={inv.cancelled ? "slate" : inv.status === "paid" ? "green" : inv.status === "partial" ? "amber" : "red"} />
      </div>

      <Card>
        <CardHeader title="تفاصيل العميل والفاتورة" />
        <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Info label="العميل">{inv.customerName}</Info>
          <Info label="هاتف العميل">{customer?.phone ?? "—"}</Info>
          <Info label="السائق">{inv.driverName ?? "—"}</Info>
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
                <TH>المنتج</TH>
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
                  <TD className="font-medium text-slate-900">{l.productName}</TD>
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

      <Dialog
        open={payOpen}
        onClose={() => setPayOpen(false)}
        title="تسجيل دفعة"
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
                recordSalesReceipt(inv.id, payAmount);
                toast.success("تم تسجيل الدفعة");
                setPayOpen(false);
              }}
            >
              تسجيل
            </Button>
          </>
        }
      >
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
      </Dialog>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        onConfirm={() => {
          cancelSalesInvoice(inv.id);
          toast.success("تم إلغاء الفاتورة", "تمت إعادة الكميات للمخزون");
        }}
        title="إلغاء الفاتورة"
        message="هل أنت متأكد من إلغاء الفاتورة؟ ستُعاد الكميات إلى المخزون."
        variant="danger"
        confirmText="تأكيد الإلغاء"
      />

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

      {returnOpen && (
        <SalesReturnDialog
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
