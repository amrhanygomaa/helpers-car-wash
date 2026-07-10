import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Printer, RotateCcw, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useInvoicing } from "../store/InvoicingContext";
import { useCatalog } from "../store/CatalogContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { lineWorkers, returnableProductLines } from "../store/_pure";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { ConfirmDialog } from "../components/ui/Dialog";
import { SalesReturnDialog } from "../features/invoices/SalesReturnDialog";
import { printServiceInvoice } from "../lib/print";
import { hasPermission } from "../lib/permissions";

export function SalesInvoiceDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { salesInvoices, salesReturns, deleteSalesInvoice } = useInvoicing();
  const { customers } = useCatalog();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const inv = salesInvoices.find((s) => s.id === id);
  const canDeleteSales = hasPermission(currentUser, "salesInvoices", "delete");
  // Returns reverse part of a sale (stock + cash), same blast radius as
  // cancelling — so they ride the "cancel" permission rather than a new key.
  const canReturn = hasPermission(currentUser, "salesInvoices", "cancel");
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
  const invoiceReturns = salesReturns.filter((r) => r.originalInvoiceId === inv.id);
  const totalReturned = invoiceReturns.reduce((sum, r) => sum + r.total, 0);
  const hasReturnable =
    !inv.cancelled &&
    returnableProductLines(inv, salesReturns).some((r) => r.returnableQty > 0);
  const totalCollected = inv.amountReceived + (inv.overpayment ?? 0);
  // The customer may have handed over more cash than the invoice total and
  // gotten change back on the spot — cashTendered preserves that real amount
  // so it isn't lost the moment amountReceived gets capped at the total.
  const cashTendered = inv.cashTendered ?? 0;
  const changeGiven = cashTendered > inv.total ? cashTendered - inv.total : 0;
  const amountPaidForDisplay = cashTendered > 0 ? cashTendered : totalCollected;

  return (
    <>
      <PageHeader
        title={`${inv.invoiceKind === "product" ? "فاتورة منتجات" : "فاتورة غسيل"} ${inv.invoiceNumber}`}
        description={`${inv.customerName} • ${formatDate(inv.date)}`}
        actions={
          <>
            <Button variant="outline" onClick={() => navigate("/sales")}>
              <ArrowRight className="w-4 h-4" />
              رجوع
            </Button>
            {canReturn && hasReturnable ? (
              <Button variant="outline" onClick={() => setReturnOpen(true)}>
                <RotateCcw className="w-4 h-4" /> مرتجع منتجات
              </Button>
            ) : null}
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
        <Stat
          label="المبلغ المدفوع"
          value={formatCurrency(amountPaidForDisplay, settings.currency)}
          tone="blue"
        />
        {changeGiven > 0 ? (
          <Stat label="الباقي المسلّم للعميل" value={formatCurrency(changeGiven, settings.currency)} tone="green" />
        ) : null}
        {inv.remaining > 0 ? (
          <Stat label="المتبقي" value={formatCurrency(inv.remaining, settings.currency)} tone="amber" />
        ) : null}
        {totalReturned > 0 ? (
          <Stat
            label="إجمالي المرتجع"
            value={`- ${formatCurrency(totalReturned, settings.currency)}`}
            tone="red"
          />
        ) : null}
        <Stat
          label="الحالة"
          value={inv.cancelled ? "ملغاة" : totalReturned > 0 ? "بها مرتجع" : "مكتملة"}
          tone={inv.cancelled ? "slate" : totalReturned > 0 ? "amber" : "green"}
        />
      </div>

      <Card>
        <CardHeader title="تفاصيل العميل والفاتورة" />
        <CardBody className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Info label="العميل">{inv.customerName}</Info>
          <Info label="هاتف العميل">{customer?.phone ?? "—"}</Info>
          {inv.vehicleLabel ? (
            <Info label="المركبة">{inv.vehicleLabel}</Info>
          ) : (
            <Info label="السائق">{inv.driverName ?? "—"}</Info>
          )}
          {inv.notes ? (
            <Info label="ملاحظات" className="col-span-1 md:col-span-3">
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

      {invoiceReturns.length > 0 ? (
        <Card>
          <CardHeader
            title="المرتجعات المسجلة"
            subtitle="كل مرتجع يعيد الكمية للمخزون ويسوّي الفاتورة تلقائياً."
          />
          <CardBody>
            <Table>
              <THead>
                <TR>
                  <TH>رقم المرتجع</TH>
                  <TH>التاريخ</TH>
                  <TH>المنتجات</TH>
                  <TH className="text-end">الإجمالي</TH>
                  <TH>نوع الرد</TH>
                  <TH>ملاحظات</TH>
                </TR>
              </THead>
              <TBody>
                {invoiceReturns.map((r) => (
                  <TR key={r.id}>
                    <TD className="font-medium text-slate-900">{r.returnNumber}</TD>
                    <TD>{formatDate(r.date)}</TD>
                    <TD>
                      {r.lines
                        .map((l) => `${l.productName} × ${l.quantity}`)
                        .join("، ")}
                    </TD>
                    <TD className="text-end font-medium text-rose-700">
                      {formatCurrency(r.total, settings.currency)}
                    </TD>
                    <TD>
                      <Badge tone={r.refundCash ? "green" : "blue"}>
                        {r.refundCash ? "رد نقدي" : "خصم من المتبقي"}
                      </Badge>
                    </TD>
                    <TD className="text-slate-600">{r.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      <SalesReturnDialog open={returnOpen} invoice={inv} onClose={() => setReturnOpen(false)} />

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
