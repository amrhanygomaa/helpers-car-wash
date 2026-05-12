import { useState } from "react";
import { Plus, Settings2, Trash2 } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useApp } from "../store/AppContext";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import type { Driver } from "../types";
import { formatCurrency } from "../lib/format";

export function DriversPage() {
  const { drivers, addDriver, updateDriver, deleteDriver, salesInvoices, settings } = useApp();
  const toast = useToast();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Driver | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const data = {
      name: fd.get("name") as string,
      phone: fd.get("phone") as string,
      licenseNumber: fd.get("licenseNumber") as string,
    };

    if (editing) {
      updateDriver(editing.id, data);
      toast.success("تم التحديث");
    } else {
      addDriver(data);
      toast.success("تمت الإضافة");
    }
    setOpen(false);
  }

  return (
    <>
      <PageHeader
        title="السائقين"
        description="إدارة بيانات السائقين وتتبع رحلاتهم"
        actions={
          <Button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="w-4 h-4" /> إضافة سائق
          </Button>
        }
      />

      <Card>
        <CardBody className="p-0">
          <Table>
            <THead>
              <TR>
                <TH>الاسم</TH>
                <TH>رقم الهاتف</TH>
                <TH>رقم الرخصة</TH>
                <TH>عدد الفواتير (رحلات)</TH>
                <TH>إجمالي المبيعات</TH>
                <TH className="w-24"></TH>
              </TR>
            </THead>
            <TBody>
              {drivers.length === 0 ? (
                <TR>
                  <TD colSpan={6} className="text-center py-8 text-slate-500">
                    لا يوجد سائقين مسجلين
                  </TD>
                </TR>
              ) : (
                drivers.map((d) => {
                  const trips = salesInvoices.filter((inv) => inv.driverId === d.id && !inv.cancelled);
                  const tripsTotal = trips.reduce((acc, inv) => acc + inv.total, 0);

                  return (
                    <TR key={d.id}>
                      <TD className="font-medium">{d.name}</TD>
                      <TD>{d.phone || "—"}</TD>
                      <TD>{d.licenseNumber || "—"}</TD>
                      <TD>{trips.length}</TD>
                      <TD className="font-medium text-slate-900">{formatCurrency(tripsTotal, settings.currency)}</TD>
                      <TD>
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => {
                              setEditing(d);
                              setOpen(true);
                            }}
                            className="p-1.5 text-slate-400 hover:text-brand-600 transition-colors"
                          >
                            <Settings2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDelId(d.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </CardBody>
      </Card>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "تعديل بيانات السائق" : "إضافة سائق جديد"}
      >
        <form id="driverForm" onSubmit={handleSave} className="space-y-4 mt-4">
          <Field label="اسم السائق" required>
            <Input name="name" defaultValue={editing?.name} required autoFocus />
          </Field>
          <Field label="رقم الهاتف">
            <Input name="phone" defaultValue={editing?.phone} />
          </Field>
          <Field label="رقم الرخصة / السيارة">
            <Input name="licenseNumber" defaultValue={editing?.licenseNumber} />
          </Field>
          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              إلغاء
            </Button>
            <Button type="submit">حفظ</Button>
          </div>
        </form>
      </Dialog>

      <ConfirmDialog
        open={!!delId}
        onClose={() => setDelId(null)}
        onConfirm={() => {
          if (!delId) return;
          const ok = deleteDriver(delId);
          if (ok) {
            toast.success("تم الحذف");
          } else {
            toast.error("لا يمكن حذف سائق لديه فواتير مرتبطة");
          }
          setDelId(null);
        }}
        title="حذف السائق"
        message="هل أنت متأكد من حذف هذا السائق؟ لا يمكن التراجع عن هذا الإجراء."
        confirmText="حذف نهائي"
        variant="danger"
      />
    </>
  );
}
