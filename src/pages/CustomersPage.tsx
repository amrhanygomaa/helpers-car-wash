import { useEffect, useMemo, useRef, useState } from "react";
import {
  Car,
  Eye,
  Pencil,
  Plus,
  Receipt,
  Search,
  ScrollText,
  Archive,
  ArchiveRestore,
  Trash2,
  Users,
  WalletCards,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Field, Select, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Drawer } from "../components/ui/Drawer";
import { useCatalog } from "../store/CatalogContext";
import { useCarwash } from "../store/CarwashContext";
import { useInvoicing } from "../store/InvoicingContext";
import { useReporting } from "../store/ReportingContext";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import { hasDb } from "../db/client";
import { todayISO } from "../lib/utils";
import { subscriptionStatusLabel } from "../lib/subscriptions";
import { listSubscriptionsForCustomer, type CustomerSubscription } from "../features/subscriptions/queries";
import type { Customer, SalesInvoice, Vehicle } from "../types";
import { Link, useNavigate } from "react-router-dom";
import { hasPermission } from "../lib/permissions";

export function CustomersPage() {
  const { customers, addCustomer, updateCustomer, deleteCustomer, archiveCustomer, nextCustomerCode } = useCatalog();
  const { vehicles } = useCarwash();
  const { salesInvoices } = useInvoicing();
  const { customerBalance } = useReporting();
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const navigate = useNavigate();
  const canAddCustomer = hasPermission(currentUser, "customers", "add");
  const canEditCustomer = hasPermission(currentUser, "customers", "edit");
  const canDeleteCustomer = hasPermission(currentUser, "customers", "delete");

  const [q, setQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "/" || (e.ctrlKey && e.key === "f")) && searchRef.current && document.activeElement !== searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const [form, setForm] = useState<Omit<Customer, "id" | "createdAt">>({
    code: "",
    name: "",
    phone: "",
    address: "",
    shippingDirection: undefined,
    notes: "",
  });

  const archivedCount = useMemo(() => customers.filter((c) => c.archived).length, [customers]);

  const customerInsights = useMemo(() => {
    const map = new Map<
      string,
      {
        vehicles: Vehicle[];
        invoices: SalesInvoice[];
        lastInvoice?: SalesInvoice;
        totalSpent: number;
      }
    >();

    for (const customer of customers) {
      const customerVehicles = vehicles
        .filter((vehicle) => vehicle.customerId === customer.id && !vehicle.archived)
        .sort((a, b) => a.plateNumber.localeCompare(b.plateNumber));
      const customerInvoices = salesInvoices
        .filter((invoice) => invoice.customerId === customer.id && !invoice.cancelled)
        .sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber));
      map.set(customer.id, {
        vehicles: customerVehicles,
        invoices: customerInvoices,
        lastInvoice: customerInvoices[0],
        totalSpent: customerInvoices.reduce((sum, invoice) => sum + invoice.total, 0),
      });
    }

    return map;
  }, [customers, vehicles, salesInvoices]);

  const overview = useMemo(() => {
    const activeCustomers = customers.filter((customer) => !customer.archived);
    return {
      activeCustomers: activeCustomers.length,
      vehicles: vehicles.filter((vehicle) => !vehicle.archived).length,
      dueCustomers: activeCustomers.filter((customer) => customerBalance(customer.id) > 0).length,
      washInvoices: salesInvoices.filter((invoice) => invoice.invoiceKind === "service" && !invoice.cancelled).length,
    };
  }, [customers, vehicles, salesInvoices, customerBalance]);

  const filtered = useMemo(() => {
    const active = customers.filter((c) => !c.archived);
    if (!q.trim()) return active;
    const t = q.trim().toLowerCase();
    return active.filter((c) => {
      const insights = customerInsights.get(c.id);
      const plates = insights?.vehicles.map((vehicle) => vehicle.plateNumber.toLowerCase()).join(" ") ?? "";
      return (
        c.name.toLowerCase().includes(t) ||
        (c.code ?? "").toLowerCase().includes(t) ||
        (c.phone ?? "").toLowerCase().includes(t) ||
        plates.includes(t)
      );
    });
  }, [q, customers, customerInsights]);

  function openNew() {
    setEditing(null);
    setForm({ code: `CUS-${String(nextCustomerCode).padStart(4, "0")}`, name: "", phone: "", address: "", shippingDirection: undefined, notes: "" });
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      code: c.code ?? "",
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      shippingDirection: c.shippingDirection,
      notes: c.notes ?? "",
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) {
      toast.error("اسم العميل مطلوب");
      return;
    }
    if (form.phone && form.phone.trim().replace(/\D/g, "").length < 11) {
      toast.error("رقم الهاتف غير صحيح", "اكتب رقم موبايل صحيح أو اتركه فارغاً");
      return;
    }
    if (editing) {
      updateCustomer(editing.id, form);
      toast.success("تم تحديث العميل");
    } else {
      addCustomer(form);
      toast.success("تم إضافة العميل");
    }
    setOpen(false);
  }
  function handleDelete() {
    if (!toDelete) return;
    const ok = deleteCustomer(toDelete.id);
    if (ok) {
      toast.success("تم حذف العميل");
    } else {
      archiveCustomer(toDelete.id, true);
      toast.success("تم أرشفة العميل", "العميل محفوظ في الأرشيف ويمكن استعادته");
    }
    setToDelete(null);
  }

  const viewingInvoices = viewing
    ? salesInvoices.filter((s) => s.customerId === viewing.id)
    : [];

  const [viewingSubs, setViewingSubs] = useState<CustomerSubscription[]>([]);
  useEffect(() => {
    if (viewing && hasDb()) {
      listSubscriptionsForCustomer(viewing.id).then(setViewingSubs).catch(() => setViewingSubs([]));
    } else {
      setViewingSubs([]);
    }
  }, [viewing]);

  return (
    <>
      <PageHeader
        title="العملاء"
        description={`ملفات العملاء، السيارات، آخر غسلة، والأرصدة (${customers.length})`}
        actions={
          canAddCustomer ? (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4" />
              إضافة عميل
            </Button>
          ) : null
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <CustomerStat icon={<Users className="h-5 w-5" />} label="عملاء نشطون" value={String(overview.activeCustomers)} tone="blue" />
        <CustomerStat icon={<Car className="h-5 w-5" />} label="سيارات مسجلة" value={String(overview.vehicles)} tone="slate" />
        <CustomerStat icon={<WalletCards className="h-5 w-5" />} label="عملاء عليهم مستحق" value={String(overview.dueCustomers)} tone="amber" />
        <CustomerStat icon={<Receipt className="h-5 w-5" />} label="فواتير غسيل" value={String(overview.washInvoices)} tone="green" />
      </div>

      <Card>
        <CardHeader
          title="قائمة العملاء"
          actions={archivedCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 text-slate-600"
              onClick={() => setShowArchived((v) => !v)}
            >
              <Archive className="w-3.5 h-3.5" />
              {showArchived ? "إخفاء الأرشيف" : `الأرشيف (${archivedCount})`}
            </Button>
          ) : undefined}
        />
        <CardBody className="space-y-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
            <Input
              ref={searchRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف أو اللوحة"
              className="pe-9"
            />
          </div>
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="w-5 h-5" />}
              title="لا يوجد عملاء"
              description="ابدأ بإضافة أول عميل."
              action={
                canAddCustomer ? (
                  <Button onClick={openNew}><Plus className="w-4 h-4" /> إضافة عميل</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الكود</TH>
                  <TH>اسم العميل</TH>
                  <TH>الهاتف</TH>
                  <TH>السيارات</TH>
                  <TH>آخر غسلة</TH>
                  <TH className="text-end">الرصيد الحالي</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => {
                  const bal = customerBalance(c.id);
                  const insights = customerInsights.get(c.id);
                  return (
                    <TR key={c.id}>
                      <TD className="text-slate-500 font-mono text-xs">{c.code ?? "—"}</TD>
                      <TD className="font-medium text-slate-900">
                        {c.name}
                        {settings.loyaltyEnabled && (c.loyaltyPoints ?? 0) > 0 ? (
                          <span className="ms-2 inline-flex items-center text-[11px] font-normal text-amber-600">⭐ {c.loyaltyPoints}</span>
                        ) : null}
                      </TD>
                      <TD className="text-slate-600">{c.phone ?? "—"}</TD>
                      <TD>
                        {insights?.vehicles.length ? (
                          <div className="flex flex-wrap gap-1">
                            {insights.vehicles.slice(0, 2).map((vehicle) => (
                              <Badge key={vehicle.id} tone="blue">{vehicle.plateNumber}</Badge>
                            ))}
                            {insights.vehicles.length > 2 ? <Badge tone="slate">+{insights.vehicles.length - 2}</Badge> : null}
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">لا توجد سيارة</span>
                        )}
                      </TD>
                      <TD className="text-slate-600">{insights?.lastInvoice ? formatDate(insights.lastInvoice.date) : "—"}</TD>
                      <TD className="text-end">
                        {bal > 0 ? (
                          <Badge tone="amber">عليه {formatCurrency(bal, settings.currency)}</Badge>
                        ) : bal < 0 ? (
                          <Badge tone="green">له رصيد {formatCurrency(-bal, settings.currency)}</Badge>
                        ) : (
                          <Badge tone="green">لا يوجد مستحق</Badge>
                        )}
                      </TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
                          <Link
                            to={`/customers/${c.id}/statement`}
                            title="كشف حساب"
                            className="inline-flex items-center justify-center w-8 h-8 rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                          >
                            <ScrollText className="w-4 h-4" />
                          </Link>
                          <Button size="icon" variant="ghost" onClick={() => setViewing(c)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          {canEditCustomer ? (
                            <Button size="icon" variant="ghost" onClick={() => openEdit(c)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                          ) : null}
                          {canDeleteCustomer ? (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-600 hover:bg-red-50"
                              onClick={() => setToDelete(c)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
                {showArchived && customers.filter((c) => c.archived).map((c) => (
                  <TR key={c.id} className="opacity-50 bg-slate-50">
                    <TD className="text-slate-400 font-mono text-xs">{c.code ?? "—"}</TD>
                    <TD className="text-slate-500 line-through">{c.name}</TD>
                    <TD className="text-slate-400">{c.phone ?? "—"}</TD>
                    <TD />
                    <TD />
                    <TD />
                    <TD className="text-end">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-slate-600 h-7 text-xs"
                          onClick={() => { archiveCustomer(c.id, false); toast.success("تمت الاستعادة"); }}
                        >
                          <ArchiveRestore className="w-3 h-3" />
                          استعادة
                        </Button>
                        {canDeleteCustomer && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50 w-7 h-7"
                            onClick={() => setToDelete(c)}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
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
        title={editing ? "تعديل عميل" : "إضافة عميل"}
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={submit}>{editing ? "حفظ" : "إضافة"}</Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="كود العميل">
            <Input
              value={form.code ?? ""}
              readOnly={!editing}
              onChange={(e) => editing && setForm({ ...form, code: e.target.value })}
              className={!editing ? "bg-gray-100 cursor-not-allowed text-gray-600 font-mono" : "font-mono"}
            />
          </Field>
          <Field label="اسم العميل" required>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>
          <Field label="الهاتف">
            <Input
              value={form.phone ?? ""}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </Field>
          <Field label="المنطقة / العنوان">
            <Input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </Field>
          <Field label="منطقة العميل" className="col-span-2">
            <Select
              value={form.shippingDirection ?? ""}
              onChange={(e) =>
                setForm({
                  ...form,
                  shippingDirection: (e.target.value as "qibli" | "bahri") || undefined,
                })
              }
            >
              <option value="">— غير محدد —</option>
              <option value="qibli">قبلي</option>
              <option value="bahri">بحري</option>
            </Select>
          </Field>
          <Field label="ملاحظات" className="col-span-2">
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>
        </div>
      </Dialog>

      <Drawer
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.name}
        subtitle="ملف العميل وسجل الفواتير"
        width={560}
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                size="sm"
                onClick={() => {
                  navigate(`/carwash/new?customerId=${viewing.id}`);
                  setViewing(null);
                }}
              >
                <Receipt className="h-4 w-4" /> فاتورة غسيل
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  navigate("/queue");
                  setViewing(null);
                }}
              >
                <Car className="h-4 w-4" /> فتح الدور
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Info label="الهاتف">{viewing.phone ?? "—"}</Info>
              <Info label="المنطقة / العنوان">{viewing.address ?? "—"}</Info>
              <Info label="الرصيد الحالي">
                {(() => {
                  const b = customerBalance(viewing.id);
                  return (
                    <span className={`font-semibold ${b > 0 ? "text-rose-700" : b < 0 ? "text-emerald-700" : "text-slate-900"}`}>
                      {b > 0
                        ? `${formatCurrency(b, settings.currency)} (مديونية)`
                        : b < 0
                          ? `${formatCurrency(-b, settings.currency)} (رصيد دائن)`
                          : "لا يوجد مستحق"}
                    </span>
                  );
                })()}
              </Info>
              <Info label="عدد الفواتير">{customerInsights.get(viewing.id)?.invoices.length ?? viewingInvoices.length}</Info>
              <Info label="عدد السيارات">{customerInsights.get(viewing.id)?.vehicles.length ?? 0}</Info>
              <Info label="إجمالي التعامل">
                {formatCurrency(customerInsights.get(viewing.id)?.totalSpent ?? 0, settings.currency)}
              </Info>
              {settings.loyaltyEnabled ? (
                <Info label="نقاط الولاء">
                  <span className="font-semibold text-amber-700">
                    {viewing.loyaltyPoints ?? 0} نقطة
                    {(viewing.loyaltyPoints ?? 0) > 0 && settings.loyaltyPointValue ? (
                      <span className="text-xs font-normal text-slate-500">
                        {" "}≈ {formatCurrency((viewing.loyaltyPoints ?? 0) * settings.loyaltyPointValue, settings.currency)}
                      </span>
                    ) : null}
                  </span>
                </Info>
              ) : null}
              {viewing.notes ? (
                <Info label="ملاحظات" className="col-span-2">
                  {viewing.notes}
                </Info>
              ) : null}
            </div>
            <div>
              <div className="text-sm font-medium mb-2">سيارات العميل</div>
              {customerInsights.get(viewing.id)?.vehicles.length ? (
                <div className="grid grid-cols-1 gap-2">
                  {customerInsights.get(viewing.id)!.vehicles.map((vehicle) => (
                    <div key={vehicle.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium text-slate-900">{vehicle.plateNumber}</div>
                        <div className="text-xs text-slate-500">
                          {[vehicle.brand, vehicle.model, vehicle.color].filter(Boolean).join(" • ") || "بدون تفاصيل"}
                        </div>
                      </div>
                      <Car className="h-4 w-4 text-slate-400" />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon={<Car className="h-5 w-5" />} title="لا توجد سيارات مسجلة" />
              )}
            </div>
            {viewingSubs.length > 0 ? (
              <div>
                <div className="text-sm font-medium mb-2">الاشتراكات والباقات</div>
                <div className="grid grid-cols-1 gap-2">
                  {viewingSubs.map((s) => {
                    const label = subscriptionStatusLabel(s, todayISO());
                    return (
                      <div key={s.id} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm">
                        <div>
                          <div className="font-medium text-slate-900">{s.packageName}</div>
                          <div className="text-xs text-slate-500">
                            {s.kind === "count" ? `متبقي ${s.remainingWashes ?? 0} من ${s.totalWashes ?? 0} غسلة` : `حتى ${s.endDate ? formatDate(s.endDate) : "—"}`}
                          </div>
                        </div>
                        <Badge tone={label === "فعّال" ? "green" : label === "ملغي" ? "red" : "slate"}>{label}</Badge>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            <div>
              <div className="text-sm font-medium mb-2">سجل الفواتير</div>
              {viewingInvoices.length === 0 ? (
                <EmptyState title="لا توجد فواتير" />
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <Table>
                    <THead>
                      <TR>
                        <TH>الفاتورة</TH>
                        <TH>التاريخ</TH>
                        <TH className="text-end">الإجمالي</TH>
                        <TH className="text-end">المتبقي</TH>
                        <TH className="text-end"></TH>
                      </TR>
                    </THead>
                    <TBody>
                      {viewingInvoices.map((inv) => (
                        <TR key={inv.id}>
                          <TD className="font-mono text-xs">{inv.invoiceNumber}</TD>
                          <TD>{formatDate(inv.date)}</TD>
                          <TD className="text-end">
                            {formatCurrency(inv.total, settings.currency)}
                          </TD>
                          <TD className="text-end">
                            {inv.overpayment && inv.overpayment > 0 ? (
                              <Badge tone="green">
                                رصيد دائن {formatCurrency(inv.overpayment, settings.currency)}
                              </Badge>
                            ) : inv.remaining > 0 ? (
                              <Badge tone="amber">
                                {formatCurrency(inv.remaining, settings.currency)}
                              </Badge>
                            ) : (
                              <Badge tone="green">مسدد</Badge>
                            )}
                          </TD>
                          <TD className="text-end">
                            <Link
                              to={`/sales/${inv.id}`}
                              className="text-xs text-brand-700 hover:underline"
                            >
                              عرض
                            </Link>
                          </TD>
                        </TR>
                      ))}
                    </TBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={handleDelete}
        title="حذف عميل"
        message={`هل أنت متأكد من حذف "${toDelete?.name}"؟`}
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
    <div
      className={`bg-slate-50 border border-slate-100 rounded-lg p-3 ${className ?? ""}`}
    >
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm text-slate-900 mt-1">{children}</div>
    </div>
  );
}

function CustomerStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700",
    green: "bg-emerald-50 text-emerald-700",
    amber: "bg-amber-50 text-amber-700",
    slate: "bg-slate-100 text-slate-700",
  };

  return (
    <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-lg ${tones[tone]}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500">{label}</div>
        <div className="text-lg font-semibold text-slate-900">{value}</div>
      </div>
    </div>
  );
}
