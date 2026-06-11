import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, ArrowRightLeft, MessageCircle, Printer, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useSettings } from "../store/SettingsContext";
import { useAuth } from "../store/AuthContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input, Select } from "../components/ui/Input";
import type { SalesPaymentType, SalesPriceType } from "../types";
import { hasPermission } from "../lib/permissions";
import { printAppRoute } from "../lib/print";
import { todayISO } from "../lib/utils";

function nextInvoiceNumber(existing: string[]): string {
  const nums = existing
    .map((x) => parseInt(x.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 1000;
  return `INV-${max + 1}`;
}

export function QuotationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { quotations, convertQuotation, deleteQuotation, salesInvoices } = useInvoicing();
  const { drivers, customers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();

  const quot = quotations.find((q) => q.id === id);
  const canAdd = hasPermission(currentUser, "salesInvoices", "add");
  const canDelete = hasPermission(currentUser, "salesInvoices", "delete");

  const [convertOpen, setConvertOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [invoiceNumber, setInvoiceNumber] = useState(() =>
    nextInvoiceNumber(salesInvoices.map((s) => s.invoiceNumber))
  );
  const [invDate, setInvDate] = useState(() => todayISO());
  const [paymentType, setPaymentType] = useState<SalesPaymentType>("cash");
  const [priceType, setPriceType] = useState<SalesPriceType>("wholesale");
  const [amountReceived, setAmountReceived] = useState(0);
  const [paymentDueDate, setPaymentDueDate] = useState("");
  const [driverId, setDriverId] = useState("");

  if (!quot) {
    return (
      <Card>
        <CardBody>
          <div className="text-center py-8">
            <div className="text-slate-900 font-medium">عرض السعر غير موجود</div>
            <Button className="mt-4" onClick={() => navigate("/quotations")}>
              العودة للقائمة
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }

  const linkedInvoice = quot.convertedInvoiceId
    ? salesInvoices.find((s) => s.id === quot.convertedInvoiceId)
    : undefined;

  function handleConvert() {
    if (!invoiceNumber.trim()) {
      toast.error("أدخل رقم الفاتورة");
      return;
    }
    const driver = drivers.find((d) => d.id === driverId);
    try {
      const inv = convertQuotation(quot!.id, {
        invoiceNumber: invoiceNumber.trim(),
        date: invDate,
        paymentType,
        priceType,
        amountReceived,
        paymentDueDate: paymentType === "account" && paymentDueDate ? paymentDueDate : undefined,
        driverId: driverId || undefined,
        driverName: driver?.name,
      });
      toast.success("تم تحويل العرض إلى فاتورة", `فاتورة رقم ${inv.invoiceNumber}`);
      setConvertOpen(false);
      navigate(`/sales/${inv.id}`);
    } catch (err) {
      // BUG-08: surface the store's stock-shortage detail instead of a generic message
      toast.error(
        "تعذر تحويل العرض",
        err instanceof Error && err.message.startsWith("المخزون") ? err.message : undefined
      );
    }
  }

  return (
    <>
      <PageHeader
        title={`عرض سعر ${quot.quotationNumber}`}
        description={`${quot.customerName} • ${formatDate(quot.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/quotations")}>
              <ArrowRight className="w-4 h-4" /> رجوع
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                const result = await printAppRoute(`/quotations/${quot.id}/print`);
                if (!result.ok && result.error !== "cancelled") {
                  toast.error("تعذر الطباعة");
                }
              }}
            >
              <Printer className="w-4 h-4" /> طباعة
            </Button>
            {(() => {
              const customer = customers.find((c) => c.id === quot.customerId);
              if (!customer?.phone) return null;
              return (
                <Button
                  variant="outline"
                  onClick={() => {
                    const phone = String(customer.phone ?? "").replace(/\D/g, "");
                    const normalized = phone.startsWith("0") ? `20${phone.slice(1)}` : phone;
                    const msg = [
                      `مرحباً ${quot.customerName}،`,
                      ``,
                      `نود تقديم عرض السعر رقم *${quot.quotationNumber}*:`,
                      `📅 التاريخ: ${formatDate(quot.date)}`,
                      quot.validUntil ? `⏳ صالح حتى: ${formatDate(quot.validUntil)}` : "",
                      `💰 الإجمالي: ${formatCurrency(quot.total, settings.currency)}`,
                      ``,
                      settings.companyNameAr || settings.companyName,
                    ].filter(Boolean).join("\n");
                    window.open(`https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`, "_blank");
                  }}
                >
                  <MessageCircle className="w-4 h-4" /> واتساب
                </Button>
              );
            })()}
            {quot.status === "draft" && canAdd ? (
              <Button onClick={() => setConvertOpen(true)}>
                <ArrowRightLeft className="w-4 h-4" /> تحويل إلى فاتورة
              </Button>
            ) : null}
            {quot.status === "draft" && canDelete ? (
              <Button variant="danger" onClick={() => setDelOpen(true)}>
                <Trash2 className="w-4 h-4" /> حذف
              </Button>
            ) : null}
          </>
        }
      />

      {quot.status === "converted" && linkedInvoice ? (
        <div
          className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-sm text-emerald-800 flex items-center justify-between cursor-pointer hover:bg-emerald-100"
          onClick={() => navigate(`/sales/${linkedInvoice.id}`)}
        >
          <span>هذا العرض تم تحويله إلى فاتورة رقم {linkedInvoice.invoiceNumber}</span>
          <ArrowRight className="w-4 h-4" />
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="الإجمالي" value={formatCurrency(quot.total, settings.currency)} />
        {quot.discount && quot.discount > 0 ? (
          <Stat label="الخصم" value={`- ${formatCurrency(quot.discount, settings.currency)}`} tone="rose" />
        ) : null}
        {quot.validUntil ? (
          <Stat label="صالح حتى" value={formatDate(quot.validUntil)} />
        ) : null}
        <Stat
          label="الحالة"
          value={quot.status === "converted" ? "محولة" : "مفتوحة"}
          tone={quot.status === "converted" ? "green" : "amber"}
        />
      </div>

      <Card>
        <CardHeader title="بيانات عرض السعر" />
        <CardBody className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Info label="العميل">{quot.customerName}</Info>
          <Info label="التاريخ">{formatDate(quot.date)}</Info>
          <Info label="عدد البنود">{quot.lines.length}</Info>
          <Info label="الحالة">
            <Badge tone={quot.status === "converted" ? "green" : "amber"}>
              {quot.status === "converted" ? "محولة" : "مفتوحة"}
            </Badge>
          </Info>
          {quot.notes ? (
            <Info label="ملاحظات" className="col-span-2 md:col-span-4">
              {quot.notes}
            </Info>
          ) : null}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="بنود عرض السعر" />
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
              {quot.lines.map((l, idx) => (
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
          {quot.discount && quot.discount > 0 ? (
            <div className="mt-3 flex flex-col items-end gap-1 text-sm">
              <div className="flex gap-6">
                <span className="text-slate-500">المجموع الفرعي</span>
                <span className="w-32 text-end">{formatCurrency(quot.total + quot.discount, settings.currency)}</span>
              </div>
              <div className="flex gap-6 text-rose-600">
                <span>الخصم</span>
                <span className="w-32 text-end">- {formatCurrency(quot.discount, settings.currency)}</span>
              </div>
              <div className="flex gap-6 font-bold text-lg">
                <span>الإجمالي</span>
                <span className="w-32 text-end">{formatCurrency(quot.total, settings.currency)}</span>
              </div>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Convert dialog */}
      <Dialog
        open={convertOpen}
        onClose={() => setConvertOpen(false)}
        title="تحويل عرض السعر إلى فاتورة"
        subtitle={`العميل: ${quot.customerName} — الإجمالي: ${formatCurrency(quot.total, settings.currency)}`}
        footer={
          <>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>إلغاء</Button>
            <Button onClick={handleConvert}>تحويل وإنشاء فاتورة</Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="رقم الفاتورة" required>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
          </Field>
          <Field label="تاريخ الفاتورة" required>
            <Input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} />
          </Field>
          <Field label="طريقة الدفع">
            <Select value={paymentType} onChange={(e) => setPaymentType(e.target.value as SalesPaymentType)}>
              <option value="cash">نقدي</option>
              <option value="account">آجل</option>
            </Select>
          </Field>
          {paymentType === "account" && (
            <Field label="تاريخ الاستحقاق">
              <Input type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
            </Field>
          )}
          <Field label="نوع السعر">
            <Select value={priceType} onChange={(e) => setPriceType(e.target.value as SalesPriceType)}>
              <option value="wholesale">جملة</option>
              <option value="retail">تجزئة</option>
            </Select>
          </Field>
          <Field label="المبلغ المستلم">
            <Input
              type="number"
              min={0}
              step="0.01"
              value={amountReceived || ""}
              onChange={(e) => setAmountReceived(Number(e.target.value))}
            />
          </Field>
          {drivers.length > 0 && (
            <Field label="السائق">
              <Select value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">-- بدون سائق --</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </Field>
          )}
        </div>
      </Dialog>

      <ConfirmDialog
        open={delOpen}
        onClose={() => setDelOpen(false)}
        onConfirm={() => {
          deleteQuotation(quot.id);
          toast.success("تم حذف عرض السعر");
          navigate("/quotations");
        }}
        title="حذف عرض السعر"
        message="هل أنت متأكد من حذف عرض السعر نهائياً؟"
        variant="danger"
        confirmText="حذف"
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
  tone?: "slate" | "green" | "amber" | "rose";
}) {
  const colors: Record<string, string> = {
    slate: "text-slate-900",
    green: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`text-lg font-semibold mt-1 ${colors[tone]}`}>{value}</div>
    </div>
  );
}
