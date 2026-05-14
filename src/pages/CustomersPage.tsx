import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Eye, Users, Search } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input, Field, Textarea } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Drawer } from "../components/ui/Drawer";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import type { Customer } from "../types";
import { Link } from "react-router-dom";
import { hasPermission } from "../lib/permissions";

export function CustomersPage() {
  const {
    customers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    customerBalance,
    salesInvoices,
    settings,
    currentUser,
  } = useApp();
  const toast = useToast();
  const canAddCustomer = hasPermission(currentUser, "customers", "add");
  const canEditCustomer = hasPermission(currentUser, "customers", "edit");
  const canDeleteCustomer = hasPermission(currentUser, "customers", "delete");

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [viewing, setViewing] = useState<Customer | null>(null);
  const [toDelete, setToDelete] = useState<Customer | null>(null);

  const [form, setForm] = useState<Omit<Customer, "id" | "createdAt">>({
    name: "",
    phone: "",
    address: "",
    notes: "",
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return customers;
    const t = q.trim().toLowerCase();
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(t) ||
        (c.phone ?? "").toLowerCase().includes(t)
    );
  }, [q, customers]);

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", address: "", notes: "" });
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm({
      name: c.name,
      phone: c.phone ?? "",
      address: c.address ?? "",
      notes: c.notes ?? "",
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) {
      toast.error("الاسم مطلوب");
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
    if (ok) toast.success("تم حذف العميل");
    else toast.error("لا يمكن الحذف", "العميل لديه فواتير مسجلة");
    setToDelete(null);
  }

  const viewingInvoices = viewing
    ? salesInvoices.filter((s) => s.customerId === viewing.id)
    : [];

  return (
    <>
      <PageHeader
        title="العملاء"
        description={`إدارة العملاء وأرصدتهم (${customers.length})`}
        actions={
          canAddCustomer ? (
            <Button onClick={openNew}>
              <Plus className="w-4 h-4" />
              إضافة عميل
            </Button>
          ) : null
        }
      />

      <Card>
        <CardHeader title="قائمة العملاء" />
        <CardBody className="space-y-3">
          <div className="relative w-72">
            <Search className="w-4 h-4 absolute top-1/2 -translate-y-1/2 end-3 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="بحث بالاسم أو الهاتف"
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
                  <TH>اسم العميل</TH>
                  <TH>الهاتف</TH>
                  <TH>العنوان</TH>
                  <TH className="text-end">الرصيد الحالي</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => {
                  const bal = customerBalance(c.id);
                  return (
                    <TR key={c.id}>
                      <TD className="font-medium text-slate-900">{c.name}</TD>
                      <TD className="text-slate-600">{c.phone ?? "—"}</TD>
                      <TD className="text-slate-600">{c.address ?? "—"}</TD>
                      <TD className="text-end">
                        {bal > 0 ? (
                          <Badge tone="amber">
                            عليه {formatCurrency(bal, settings.currency)}
                          </Badge>
                        ) : (
                          <Badge tone="green">لا يوجد مستحق</Badge>
                        )}
                      </TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
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
          <Field label="اسم العميل" required className="col-span-2">
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
          <Field label="العنوان">
            <Input
              value={form.address ?? ""}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
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
            <div className="grid grid-cols-2 gap-3">
              <Info label="الهاتف">{viewing.phone ?? "—"}</Info>
              <Info label="العنوان">{viewing.address ?? "—"}</Info>
              <Info label="الرصيد الحالي">
                <span className="font-semibold">
                  {formatCurrency(customerBalance(viewing.id), settings.currency)}
                </span>
              </Info>
              <Info label="عدد الفواتير">{viewingInvoices.length}</Info>
              {viewing.notes ? (
                <Info label="ملاحظات" className="col-span-2">
                  {viewing.notes}
                </Info>
              ) : null}
            </div>
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
                            {inv.remaining > 0 ? (
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
