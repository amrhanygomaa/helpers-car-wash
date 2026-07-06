import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select } from "../../components/ui/Input";
import type { Customer, Vehicle } from "../../types";
import { useCarwash } from "../../store/CarwashContext";
import { useToast } from "../../components/ui/Toast";
import { BrandCombobox } from "./BrandCombobox";
import { isValidEgyptPlateNumber, normalizeEgyptPlateNumber } from "../../lib/utils";
import { PlateNumberInput } from "../../components/ui/PlateNumberInput";

type FormState = { brand: string; model: string; plateNumber: string; color: string };

const EMPTY: FormState = { brand: "", model: "", plateNumber: "", color: "" };

export function VehicleFormDialog({
  open,
  onClose,
  customerId,
  customers,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  /** Pre-selected customer (e.g. the one already chosen on the invoice). */
  customerId?: string;
  /** Full customer list — only needed when customerId isn't already fixed. */
  customers: Customer[];
  onCreated?: (vehicle: Vehicle) => void;
}) {
  const { addVehicle } = useCarwash();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [selectedCustomerId, setSelectedCustomerId] = useState(customerId ?? "");

  useEffect(() => {
    if (open) {
      setForm(EMPTY);
      setSelectedCustomerId(customerId ?? "");
    }
  }, [open, customerId]);

  function submit() {
    if (!selectedCustomerId) {
      toast.error("اختر العميل");
      return;
    }
    if (!form.brand.trim()) {
      toast.error("أدخل الماركة");
      return;
    }
    const plateNumber = normalizeEgyptPlateNumber(form.plateNumber);
    if (!plateNumber) {
      toast.error("أدخل رقم اللوحة");
      return;
    }
    if (!isValidEgyptPlateNumber(plateNumber)) {
      toast.error(
        "رقم اللوحة غير صحيح. استخدم 2-3 حروف مفصولة بمسافة ثم 3-4 أرقام مثل: ن هـ 7535"
      );
      return;
    }
    const created = addVehicle({
      customerId: selectedCustomerId,
      brand: form.brand.trim(),
      model: form.model.trim(),
      plateNumber,
      color: form.color.trim(),
    });
    toast.success("تمت إضافة المركبة");
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
      title="إضافة مركبة جديدة"
      width="lg"
      footer={
        <>
          <Button variant="outline" size="lg" onClick={onClose}>إلغاء</Button>
          <Button size="lg" onClick={submit}>إضافة المركبة</Button>
        </>
      }
    >
      {/* min-h leaves room for the brand dropdown to open without clipping */}
      <div className="space-y-4 min-h-[21rem]">
        {!customerId && (
          <Field label="العميل" required>
            <Select className="h-11 text-base" value={selectedCustomerId} onChange={(e) => setSelectedCustomerId(e.target.value)}>
              <option value="" disabled>اختر العميل</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="الماركة" required>
            <BrandCombobox value={form.brand} onChange={(v) => set("brand", v)} autoFocus />
          </Field>
          <Field label="الموديل">
            <Input className="h-11 text-base" value={form.model} onChange={(e) => set("model", e.target.value)} />
          </Field>
          <Field
            label="رقم اللوحة"
            required
            hint="مثال: ن هـ 7535 — 2-3 حروف مفصولة بمسافة ثم 3-4 أرقام"
          >
            <PlateNumberInput className="h-11" value={form.plateNumber} onPlateChange={(v) => set("plateNumber", v)} />
          </Field>
          <Field label="اللون">
            <Input className="h-11 text-base" value={form.color} onChange={(e) => set("color", e.target.value)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
