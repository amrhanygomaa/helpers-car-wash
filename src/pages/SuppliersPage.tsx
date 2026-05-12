import { useMemo, useState } from "react";
import { Pencil, Plus, Trash2, Eye, Factory, Search } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Textarea } from "../components/ui/Input";
import { Drawer } from "../components/ui/Drawer";
import { useApp } from "../store/AppContext";
import { useToast } from "../components/ui/Toast";
import { formatCurrency, formatDate } from "../lib/format";
import type { Supplier } from "../types";

export function SuppliersPage() {
  const {
    suppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    supplierBalance,
    purchaseInvoices,
    settings,
  } = useApp();
  const toast = useToast();

  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [viewing, setViewing] = useState<Supplier | null>(null);
  const [toDelete, setToDelete] = useState<Supplier | null>(null);

  const [form, setForm] = useState<Omit<Supplier, "id" | "createdAt">>({
    name: "",
    phone: "",
    address: "",
    notes: "",
    commissionNote: "",
  });

  const filtered = useMemo(() => {
    if (!q.trim()) return suppliers;
    const t = q.trim().toLowerCase();
    return suppliers.filter(
      (s) =>
        s.name.toLowerCase().includes(t) ||
        (s.phone ?? "").toLowerCase().includes(t)
    );
  }, [q, suppliers]);

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", address: "", notes: "", commissionNote: "" });
    setOpen(true);
  }
  function openEdit(s: Supplier) {
    setEditing(s);
    setForm({
      name: s.name,
      phone: s.phone ?? "",
      address: s.address ?? "",
      notes: s.notes ?? "",
      commissionNote: s.commissionNote ?? "",
    });
    setOpen(true);
  }
  function submit() {
    if (!form.name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (editing) {
      updateSupplier(editing.id, form);
      toast.success("تم تحديث المورد");
    } else {
      addSupplier(form);
      toast.success("تم إضافة المورد");
    }
    setOpen(false);
  }
  function handleDelete() {
    if (!toDelete) return;
    const ok = deleteSupplier(toDelete.id);
    if (ok) toast.success("تم حذف المورد");
    else toast.error("لا يمكن حذف المورد", "المورد مرتبط بفواتير أو منتجات");
    setToDelete(null);
  }

  const viewingInvoices = viewing
    ? purchaseInvoices.filter((p) => p.supplierId === viewing.id)
    : [];

  return (
    <>
      <PageHeader
        title="الموردين / المصانع"
        description={`إدارة الموردين وأرصدتهم (${suppliers.length})`}
        actions={
          <Button onClick={openNew}>
            <Plus className="w-4 h-4" />
            إضافة مورد
          </Button>
        }
      />

      <Card>
        <CardHeader title="قائمة الموردين" />
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
              icon={<Factory className="w-5 h-5" />}
              title="لا يوجد موردون"
              description="ابدأ بإضافة أول مورد لشركتك."
              action={<Button onClick={openNew}><Plus className="w-4 h-4" /> إضافة مورد</Button>}
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>اسم المورد</TH>
                  <TH>الهاتف</TH>
                  <TH>العنوان</TH>
                  <TH>ملاحظة عمولة</TH>
                  <TH className="text-end">الرصيد المستحق</TH>
                  <TH className="text-end">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => {
                  const bal = supplierBalance(s.id);
                  return (
                    <TR key={s.id}>
                      <TD className="font-medium text-slate-900">{s.name}</TD>
                      <TD className="text-slate-600">{s.phone ?? "—"}</TD>
                      <TD className="text-slate-600">{s.address ?? "—"}</TD>
                      <TD className="text-slate-600 text-xs">
                        {s.commissionNote ?? "—"}
                      </TD>
                      <TD className="text-end">
                        {bal > 0 ? (
                          <Badge tone="amber">
                            {formatCurrency(bal, settings.currency)}
                          </Badge>
                        ) : (
                          <Badge tone="green">مسدد</Badge>
                        )}
                      </TD>
                      <TD className="text-end">
                        <div className="inline-flex items-center gap-1">
                          <Button size="icon" variant="ghost" onClick={() => setViewing(s)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => openEdit(s)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => setToDelete(s)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
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
        title={editing ? "تعديل مورد" : "إضافة مورد"}
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
          <Field label="اسم المورد" required className="col-span-2">
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
          <Field label="ملاحظة عمولة / هدف" className="col-span-2">
            <Input
              value={form.commissionNote ?? ""}
              onChange={(e) =>
                setForm({ ...form, commissionNote: e.target.value })
              }
              placeholder="مثل: خصم 2% على الكميات الكبيرة"
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
        subtitle="سجل المورد والفواتير"
        width={560}
      >
        {viewing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Info label="الهاتف">{viewing.phone ?? "—"}</Info>
              <Info label="العنوان">{viewing.address ?? "—"}</Info>
              <Info label="الرصيد المستحق">
                <span className="font-semibold">
                  {formatCurrency(supplierBalance(viewing.id), settings.currency)}
                </span>
              </Info>
              <Info label="عدد الفواتير">{viewingInvoices.length}</Info>
              <Info label="ملاحظة عمولة" className="col-span-2">
                {viewing.commissionNote ?? "—"}
              </Info>
              {viewing.notes ? (
                <Info label="ملاحظات" className="col-span-2">
                  {viewing.notes}
                </Info>
              ) : null}
            </div>
            <div>
              <div className="text-sm font-medium mb-2">فواتير المورد</div>
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
        title="حذف مورد"
        message={`هل أنت متأكد من حذف المورد "${toDelete?.name}"؟`}
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
