import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Textarea } from "../../components/ui/Input";
import type { Customer } from "../../types";
import { useCatalog } from "../../store/CatalogContext";
import { useToast } from "../../components/ui/Toast";

type FormState = Pick<Customer, "code" | "name" | "phone" | "address" | "notes">;

const EMPTY: FormState = {
  code: "",
  name: "",
  phone: "",
  address: "",
  notes: "",
};

export function CustomerFormDialog({
  open,
  onClose,
  onCreated,
  initialName,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (customer: Customer) => void;
  /** Pre-fills the name field, e.g. from an unmatched search query. */
  initialName?: string;
}) {
  const { addCustomer, nextCustomerCode } = useCatalog();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);

  useEffect(() => {
    if (open) {
      const query = (initialName ?? "").trim();
      const isPhone = /^[0-9]+$/.test(query);
      setForm({
        ...EMPTY,
        code: `CUS-${String(nextCustomerCode).padStart(4, "0")}`,
        name: isPhone ? "" : query,
        phone: isPhone ? query : "",
      });
    }
  }, [open, nextCustomerCode, initialName]);

  function submit() {
    if (!form.name.trim()) {
      toast.error("الاسم مطلوب");
      return;
    }
    if (form.phone && form.phone.trim().replace(/\D/g, "").length !== 11) {
      toast.error("رقم الهاتف غير صحيح", "يجب أن يكون رقم الهاتف مكوناً من 11 رقماً بالضبط");
      return;
    }
    const created = addCustomer(form);
    toast.success("تم إضافة العميل");
    onCreated?.(created);
    onClose();
  }

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="إضافة عميل جديد"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={submit}>إضافة العميل</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="كود العميل">
          <Input
            value={form.code ?? ""}
            readOnly
            className="bg-gray-100 cursor-not-allowed text-gray-600 font-mono"
          />
        </Field>
        <Field label="اسم العميل" required>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
        </Field>
        <Field label="الهاتف">
          <Input
            value={form.phone ?? ""}
            maxLength={11}
            onChange={(e) => set("phone", e.target.value.replace(/\D/g, ""))}
          />
        </Field>
      </div>
    </Dialog>
  );
}
