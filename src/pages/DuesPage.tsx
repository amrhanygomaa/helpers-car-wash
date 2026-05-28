import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  MessageCircle,
  Search,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/Tabs";
import { useApp } from "../store/AppContext";
import { formatCurrency, formatDate } from "../lib/format";
import type { PurchaseInvoice, SalesInvoice } from "../types";

type DueStatus = "overdue" | "today" | "soon" | "scheduled" | "undated";
type PartyType = "customer" | "supplier";
type PartyDirection = "theyOweUs" | "weOweThem";

interface PartyBalanceRow {
  id: string;
  type: PartyType;
  name: string;
  code?: string;
  phone?: string;
  balance: number;
  direction: PartyDirection;
  openInvoices: number;
  overdueInvoices: number;
  dueSoonInvoices: number;
  lastActivity?: string;
}

interface SalesDueRow {
  invoice: SalesInvoice;
  days: number | null;
  status: DueStatus;
  customerPhone?: string;
  customerCode?: string;
}

interface PurchaseDueRow {
  invoice: PurchaseInvoice;
  supplierPhone?: string;
  supplierCode?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function dateOnly(value?: string) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysUntil(value?: string) {
  const date = dateOnly(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - today.getTime()) / DAY_MS);
}

function dueStatus(days: number | null): DueStatus {
  if (days === null) return "undated";
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= 7) return "soon";
  return "scheduled";
}

function statusLabel(status: DueStatus, days: number | null) {
  if (status === "undated") return "بدون ميعاد";
  if (status === "overdue") return `متأخر ${Math.abs(days ?? 0)} يوم`;
  if (status === "today") return "مستحق اليوم";
  if (status === "soon") return `خلال ${days} يوم`;
  return `بعد ${days} يوم`;
}

function statusTone(status: DueStatus): "red" | "amber" | "blue" | "slate" {
  if (status === "overdue") return "red";
  if (status === "today" || status === "soon") return "amber";
  if (status === "scheduled") return "blue";
  return "slate";
}

function whatsappHref(phone?: string) {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return undefined;
  const normalized = digits.startsWith("0") ? `20${digits.slice(1)}` : digits;
  return `https://wa.me/${normalized}`;
}

function includesTerm(...values: Array<string | number | undefined>) {
  return (term: string) =>
    values.some((value) => String(value ?? "").toLowerCase().includes(term));
}

export function DuesPage() {
  const navigate = useNavigate();
  const {
    customers,
    suppliers,
    salesInvoices,
    purchaseInvoices,
    customerBalance,
    supplierBalance,
    settings,
  } = useApp();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<DueStatus | "all">("all");
  const [partyFilter, setPartyFilter] = useState<"all" | PartyType>("all");

  const customerLookup = useMemo(
    () => new Map(customers.map((customer) => [customer.id, customer])),
    [customers]
  );
  const supplierLookup = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers]
  );

  const salesDueRows = useMemo<SalesDueRow[]>(() => {
    return salesInvoices
      .filter((invoice) => !invoice.cancelled && invoice.remaining > 0)
      .map((invoice) => {
        const customer = customerLookup.get(invoice.customerId);
        const days = daysUntil(invoice.paymentDueDate);
        return {
          invoice,
          days,
          status: dueStatus(days),
          customerPhone: customer?.phone,
          customerCode: customer?.code,
        };
      })
      .sort((a, b) => {
        const aRank = a.days ?? 9999;
        const bRank = b.days ?? 9999;
        return aRank - bRank || b.invoice.remaining - a.invoice.remaining;
      });
  }, [customerLookup, salesInvoices]);

  const purchaseDueRows = useMemo<PurchaseDueRow[]>(() => {
    return purchaseInvoices
      .filter((invoice) => invoice.remaining > 0)
      .map((invoice) => {
        const supplier = supplierLookup.get(invoice.supplierId);
        return {
          invoice,
          supplierPhone: supplier?.phone,
          supplierCode: supplier?.code,
        };
      })
      .sort((a, b) => b.invoice.remaining - a.invoice.remaining);
  }, [purchaseInvoices, supplierLookup]);

  const partyRows = useMemo<PartyBalanceRow[]>(() => {
    const customerRows: PartyBalanceRow[] = customers
      .map((customer) => {
        const balance = customerBalance(customer.id);
        const relatedDueRows = salesDueRows.filter(
          (row) => row.invoice.customerId === customer.id
        );
        const lastActivity = salesInvoices
          .filter((invoice) => invoice.customerId === customer.id && !invoice.cancelled)
          .map((invoice) => invoice.date)
          .sort()
          .at(-1);

        return {
          id: customer.id,
          type: "customer" as const,
          name: customer.name,
          code: customer.code,
          phone: customer.phone,
          balance,
          direction: balance >= 0 ? ("theyOweUs" as const) : ("weOweThem" as const),
          openInvoices: relatedDueRows.length,
          overdueInvoices: relatedDueRows.filter((row) => row.status === "overdue").length,
          dueSoonInvoices: relatedDueRows.filter(
            (row) => row.status === "today" || row.status === "soon"
          ).length,
          lastActivity,
        };
      })
      .filter((row) => row.balance !== 0 || row.openInvoices > 0);

    const supplierRows: PartyBalanceRow[] = suppliers
      .map((supplier) => {
        const balance = supplierBalance(supplier.id);
        const relatedInvoices = purchaseDueRows.filter(
          (row) => row.invoice.supplierId === supplier.id
        );
        const lastActivity = purchaseInvoices
          .filter((invoice) => invoice.supplierId === supplier.id)
          .map((invoice) => invoice.date)
          .sort()
          .at(-1);

        return {
          id: supplier.id,
          type: "supplier" as const,
          name: supplier.name,
          code: supplier.code,
          phone: supplier.phone,
          balance,
          direction: balance > 0 ? ("weOweThem" as const) : ("theyOweUs" as const),
          openInvoices: relatedInvoices.length,
          overdueInvoices: 0,
          dueSoonInvoices: 0,
          lastActivity,
        };
      })
      .filter((row) => row.balance !== 0 || row.openInvoices > 0);

    return [...customerRows, ...supplierRows].sort(
      (a, b) => Math.abs(b.balance) - Math.abs(a.balance)
    );
  }, [
    customers,
    suppliers,
    customerBalance,
    supplierBalance,
    salesDueRows,
    salesInvoices,
    purchaseDueRows,
    purchaseInvoices,
  ]);

  const filteredSalesRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return salesDueRows.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (!term) return true;
      return includesTerm(
        row.invoice.invoiceNumber,
        row.invoice.customerName,
        row.customerCode,
        row.customerPhone
      )(term);
    });
  }, [query, salesDueRows, statusFilter]);

  const filteredPartyRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return partyRows.filter((row) => {
      if (partyFilter !== "all" && row.type !== partyFilter) return false;
      if (!term) return true;
      return includesTerm(row.name, row.code, row.phone)(term);
    });
  }, [partyFilter, partyRows, query]);

  const filteredPurchaseRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return purchaseDueRows;
    return purchaseDueRows.filter((row) =>
      includesTerm(
        row.invoice.invoiceNumber,
        row.invoice.supplierName,
        row.supplierCode,
        row.supplierPhone
      )(term)
    );
  }, [purchaseDueRows, query]);

  const totals = useMemo(() => {
    const customerReceivables = partyRows
      .filter((row) => row.type === "customer" && row.balance > 0)
      .reduce((sum, row) => sum + row.balance, 0);
    const customerCredits = partyRows
      .filter((row) => row.type === "customer" && row.balance < 0)
      .reduce((sum, row) => sum + Math.abs(row.balance), 0);
    const supplierPayables = partyRows
      .filter((row) => row.type === "supplier" && row.balance > 0)
      .reduce((sum, row) => sum + row.balance, 0);
    const supplierCredits = partyRows
      .filter((row) => row.type === "supplier" && row.balance < 0)
      .reduce((sum, row) => sum + Math.abs(row.balance), 0);
    const overdueSales = salesDueRows
      .filter((row) => row.status === "overdue")
      .reduce((sum, row) => sum + row.invoice.remaining, 0);
    const dueSoonSales = salesDueRows
      .filter((row) => row.status === "today" || row.status === "soon")
      .reduce((sum, row) => sum + row.invoice.remaining, 0);
    const undatedSales = salesDueRows
      .filter((row) => row.status === "undated")
      .reduce((sum, row) => sum + row.invoice.remaining, 0);

    return {
      customerReceivables,
      customerCredits,
      supplierPayables,
      supplierCredits,
      receivablesTotal: customerReceivables + supplierCredits,
      payablesTotal: supplierPayables + customerCredits,
      overdueSales,
      dueSoonSales,
      undatedSales,
      net: customerReceivables + supplierCredits - supplierPayables - customerCredits,
    };
  }, [partyRows, salesDueRows]);

  const priorityRows = salesDueRows
    .filter((row) => row.status === "overdue" || row.status === "today" || row.status === "soon")
    .slice(0, 6);

  return (
    <>
      <PageHeader
        title="المستحقات والديون"
        description="متابعة أرصدة العملاء والموردين ومواعيد التحصيل"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <StatCard
          icon={<ArrowDownLeft className="w-5 h-5" />}
          label="فلوس لنا"
          value={formatCurrency(totals.receivablesTotal, settings.currency)}
          detail={`عملاء: ${formatCurrency(totals.customerReceivables, settings.currency)}`}
          tone="green"
        />
        <StatCard
          icon={<ArrowUpRight className="w-5 h-5" />}
          label="فلوس علينا"
          value={formatCurrency(totals.payablesTotal, settings.currency)}
          detail={`موردين: ${formatCurrency(totals.supplierPayables, settings.currency)}`}
          tone="red"
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="تحصيل متأخر"
          value={formatCurrency(totals.overdueSales, settings.currency)}
          detail={`${salesDueRows.filter((row) => row.status === "overdue").length} فاتورة متأخرة`}
          tone="amber"
        />
      </div>

      <Card>
        <CardHeader
          title="تنبيهات التحصيل"
          subtitle={`مستحق قريباً: ${formatCurrency(totals.dueSoonSales, settings.currency)} - بدون ميعاد: ${formatCurrency(totals.undatedSales, settings.currency)}`}
          actions={
            <Badge tone={priorityRows.length > 0 ? "amber" : "green"}>
              {priorityRows.length > 0 ? `${priorityRows.length} أولوية` : "لا توجد أولويات"}
            </Badge>
          }
        />
        <CardBody className="space-y-3">
          {priorityRows.length === 0 ? (
            <div className="min-h-32 grid place-items-center text-sm text-slate-500">
              لا توجد فواتير متأخرة أو مستحقة قريباً
            </div>
          ) : (
            priorityRows.map((row) => (
              <div
                key={row.invoice.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link
                      to={`/sales/${row.invoice.id}`}
                      className="font-mono text-xs text-brand-700 hover:underline"
                    >
                      {row.invoice.invoiceNumber}
                    </Link>
                    <Badge tone={statusTone(row.status)}>
                      {statusLabel(row.status, row.days)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-sm font-medium text-slate-900">
                    {row.invoice.customerName}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-rose-700">
                    {formatCurrency(row.invoice.remaining, settings.currency)}
                  </span>
                  <ContactButton phone={row.customerPhone} />
                </div>
              </div>
            ))
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="flex flex-wrap items-center gap-2">
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث باسم، رقم فاتورة، كود، هاتف..."
              className="pe-9"
            />
          </div>
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as DueStatus | "all")}
            className="w-full md:w-44"
          >
            <option value="all">كل مواعيد التحصيل</option>
            <option value="overdue">متأخر</option>
            <option value="today">مستحق اليوم</option>
            <option value="soon">خلال 7 أيام</option>
            <option value="scheduled">مجدول لاحقاً</option>
            <option value="undated">بدون ميعاد</option>
          </Select>
          <Select
            value={partyFilter}
            onChange={(event) => setPartyFilter(event.target.value as "all" | PartyType)}
            className="w-full md:w-40"
          >
            <option value="all">كل الأطراف</option>
            <option value="customer">العملاء</option>
            <option value="supplier">الموردين</option>
          </Select>
          <Button
            variant="outline"
            onClick={() => {
              setQuery("");
              setStatusFilter("all");
              setPartyFilter("all");
            }}
          >
            مسح الفلاتر
          </Button>
        </CardBody>
      </Card>

      <Tabs defaultValue="alerts">
        <TabsList className="flex flex-wrap">
          <TabsTrigger value="alerts">مواعيد التحصيل</TabsTrigger>
          <TabsTrigger value="parties">أرصدة الناس</TabsTrigger>
          <TabsTrigger value="suppliers">مستحقات الموردين</TabsTrigger>
        </TabsList>

        <TabsContent value="alerts">
          <Card>
            <CardHeader title="فواتير العملاء المفتوحة" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>الفاتورة</TH>
                    <TH>العميل</TH>
                    <TH>تاريخ الفاتورة</TH>
                    <TH>ميعاد الدفع</TH>
                    <TH>الحالة</TH>
                    <TH className="text-end">المتبقي</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredSalesRows.length === 0 ? (
                    <EmptyRow colSpan={7} text="لا توجد فواتير مطابقة" />
                  ) : (
                    filteredSalesRows.map((row) => (
                      <TR key={row.invoice.id}>
                        <TD>
                          <Link
                            to={`/sales/${row.invoice.id}`}
                            className="font-mono text-xs text-brand-700 hover:underline"
                          >
                            {row.invoice.invoiceNumber}
                          </Link>
                        </TD>
                        <TD>
                          <div className="font-medium text-slate-900">
                            {row.invoice.customerName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.customerPhone || row.customerCode || "—"}
                          </div>
                        </TD>
                        <TD>{formatDate(row.invoice.date)}</TD>
                        <TD>{row.invoice.paymentDueDate ? formatDate(row.invoice.paymentDueDate) : "—"}</TD>
                        <TD>
                          <Badge tone={statusTone(row.status)}>
                            {statusLabel(row.status, row.days)}
                          </Badge>
                        </TD>
                        <TD className="text-end font-mono font-semibold text-rose-700">
                          {formatCurrency(row.invoice.remaining, settings.currency)}
                        </TD>
                        <TD className="text-end">
                          <div className="inline-flex items-center gap-1">
                            <ContactButton phone={row.customerPhone} compact />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => navigate(`/sales/${row.invoice.id}`)}
                            >
                              عرض
                            </Button>
                          </div>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="parties">
          <Card>
            <CardHeader title="كل الناس اللي ليها أو عليها فلوس" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>الطرف</TH>
                    <TH>النوع</TH>
                    <TH>الحالة</TH>
                    <TH className="text-end">الرصيد</TH>
                    <TH className="text-end">فواتير مفتوحة</TH>
                    <TH className="text-end">متأخر</TH>
                    <TH>آخر حركة</TH>
                    <TH className="text-end">تواصل</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredPartyRows.length === 0 ? (
                    <EmptyRow colSpan={8} text="لا توجد أرصدة مطابقة" />
                  ) : (
                    filteredPartyRows.map((row) => (
                      <TR key={`${row.type}-${row.id}`}>
                        <TD>
                          <div className="font-medium text-slate-900">{row.name}</div>
                          <div className="text-xs text-slate-500">{row.code || row.phone || "—"}</div>
                        </TD>
                        <TD>
                          <Badge tone={row.type === "customer" ? "blue" : "indigo"}>
                            {row.type === "customer" ? "عميل" : "مورد"}
                          </Badge>
                        </TD>
                        <TD>
                          <Badge tone={row.direction === "theyOweUs" ? "green" : "rose"}>
                            {row.direction === "theyOweUs" ? "عليه فلوس لنا" : "له فلوس علينا"}
                          </Badge>
                        </TD>
                        <TD className="text-end font-mono font-semibold">
                          {formatCurrency(Math.abs(row.balance), settings.currency)}
                        </TD>
                        <TD className="text-end">{row.openInvoices}</TD>
                        <TD className="text-end">
                          {row.overdueInvoices > 0 ? (
                            <Badge tone="red">{row.overdueInvoices}</Badge>
                          ) : (
                            <span className="text-slate-400">0</span>
                          )}
                        </TD>
                        <TD>{row.lastActivity ? formatDate(row.lastActivity) : "—"}</TD>
                        <TD className="text-end">
                          <ContactButton phone={row.phone} compact />
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>

        <TabsContent value="suppliers">
          <Card>
            <CardHeader title="فواتير الموردين المفتوحة" />
            <CardBody>
              <Table>
                <THead>
                  <TR>
                    <TH>الفاتورة</TH>
                    <TH>المورد</TH>
                    <TH>التاريخ</TH>
                    <TH className="text-end">الإجمالي</TH>
                    <TH className="text-end">المدفوع</TH>
                    <TH className="text-end">المتبقي</TH>
                    <TH className="text-end">إجراءات</TH>
                  </TR>
                </THead>
                <TBody>
                  {filteredPurchaseRows.length === 0 ? (
                    <EmptyRow colSpan={7} text="لا توجد مستحقات موردين مطابقة" />
                  ) : (
                    filteredPurchaseRows.map((row) => (
                      <TR key={row.invoice.id}>
                        <TD>
                          <Link
                            to={`/purchases/${row.invoice.id}`}
                            className="font-mono text-xs text-brand-700 hover:underline"
                          >
                            {row.invoice.invoiceNumber}
                          </Link>
                        </TD>
                        <TD>
                          <div className="font-medium text-slate-900">
                            {row.invoice.supplierName}
                          </div>
                          <div className="text-xs text-slate-500">
                            {row.supplierPhone || row.supplierCode || "—"}
                          </div>
                        </TD>
                        <TD>{formatDate(row.invoice.date)}</TD>
                        <TD className="text-end font-mono">
                          {formatCurrency(row.invoice.total, settings.currency)}
                        </TD>
                        <TD className="text-end font-mono text-emerald-700">
                          {formatCurrency(row.invoice.amountPaid, settings.currency)}
                        </TD>
                        <TD className="text-end font-mono font-semibold text-rose-700">
                          {formatCurrency(row.invoice.remaining, settings.currency)}
                        </TD>
                        <TD className="text-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(`/purchases/${row.invoice.id}`)}
                          >
                            عرض
                          </Button>
                        </TD>
                      </TR>
                    ))
                  )}
                </TBody>
              </Table>
            </CardBody>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone: "green" | "red" | "amber" | "blue";
}) {
  const colors: Record<typeof tone, string> = {
    green: "bg-emerald-50 text-emerald-700",
    red: "bg-rose-50 text-rose-700",
    amber: "bg-amber-50 text-amber-700",
    blue: "bg-blue-50 text-blue-700",
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 shadow-card">
      <div className={`w-11 h-11 rounded-lg grid place-items-center shrink-0 ${colors[tone]}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="font-semibold text-slate-900 text-lg truncate">{value}</div>
        <div className="text-[11px] text-slate-500 truncate">{detail}</div>
      </div>
    </div>
  );
}


function ContactButton({ phone, compact }: { phone?: string; compact?: boolean }) {
  const href = whatsappHref(phone);
  if (!href) {
    return (
      <span className="inline-flex items-center justify-center h-8 px-2 text-xs text-slate-400">
        لا يوجد هاتف
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center justify-center gap-1 h-8 px-2 rounded-lg border border-emerald-200 bg-emerald-50 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
      title="فتح واتساب"
    >
      <MessageCircle className="w-3.5 h-3.5" />
      {compact ? null : <span>واتساب</span>}
    </a>
  );
}

function EmptyRow({ colSpan, text }: { colSpan: number; text: string }) {
  return (
    <TR>
      <TD colSpan={colSpan} className="py-8 text-center text-slate-500">
        {text}
      </TD>
    </TR>
  );
}
