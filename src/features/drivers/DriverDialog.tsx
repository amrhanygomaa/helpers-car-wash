import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { Field, Input } from "../../components/ui/Input";
import { useApp } from "../../store/AppContext";
import { useToast } from "../../components/ui/Toast";
import type { Driver } from "../../types";

export function DriverDialog({
  open,
  onClose,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Driver | null;
  onSaved?: (driver: Driver) => void;
}) {
  const { addDriver, updateDriver } = useApp();
  const toast = useToast();

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
      if (onSaved) onSaved({ ...editing, ...data });
    } else {
      const drv = addDriver(data);
      toast.success("تمت الإضافة");
      if (onSaved) onSaved(drv);
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
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
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button type="submit">حفظ</Button>
        </div>
      </form>
    </Dialog>
  );
}
