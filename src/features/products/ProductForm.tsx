import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Input";
import type { Product } from "../../types";
import { useApp } from "../../store/AppContext";
import { useToast } from "../../components/ui/Toast";

const UNITS = ["كيلو", "جرام", "لتر", "كيس", "علبة", "كرتونة", "زجاجة", "كوب", "قطعة", "علبة صغيرة"];
const CATEGORIES = [
  "مواد غذائية",
  "ألبان",
  "مخبوزات",
  "مشروبات",
  "منظفات",
  "مستلزمات",
  "أخرى",
];

type FormState = Omit<Product, "id" | "createdAt">;

const EMPTY: FormState = {
  code: "",
  name: "",
  category: "مواد غذائية",
  unit: "قطعة",
  purchasePrice: 0,
  sellingPrice: 0,
  quantity: 0,
  minStock: 5,
  hasExpiry: false,
  expiryDate: undefined,
  supplierId: undefined,
  notes: "",
};

export function ProductFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: Product | null;
}) {
  const { addProduct, updateProduct, suppliers } = useApp();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _c, ...rest } = editing;
      void _id;
      void _c;
      setForm(rest);
    } else {
      setForm({ ...EMPTY, code: `P-${Math.floor(1000 + Math.random() * 9000)}` });
    }
    setErrors({});
  }, [editing, open]);

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "اسم المنتج مطلوب";
    if (!form.code.trim()) e.code = "الكود مطلوب";
    if (form.purchasePrice < 0) e.purchasePrice = "يجب أن يكون موجباً";
    if (form.sellingPrice < 0) e.sellingPrice = "يجب أن يكون موجباً";
    if (form.quantity < 0) e.quantity = "يجب أن يكون موجباً";
    if (form.minStock < 0) e.minStock = "يجب أن يكون موجباً";
    if (form.hasExpiry && !form.expiryDate)
      e.expiryDate = "تاريخ الصلاحية مطلوب";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    if (editing) {
      updateProduct(editing.id, form);
      toast.success("تم تحديث المنتج");
    } else {
      addProduct(form);
      toast.success("تم إضافة المنتج");
    }
    onClose();
  }

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "تعديل منتج" : "إضافة منتج جديد"}
      subtitle="املأ بيانات المنتج — العمليات تحفظ تلقائياً في المخزون"
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit}>
            {editing ? "حفظ التعديلات" : "إضافة المنتج"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="كود المنتج" required error={errors.code}>
          <Input
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
          />
        </Field>
        <Field label="اسم المنتج" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="مثل: أرز مصري 5 كجم"
          />
        </Field>
        <Field label="الفئة">
          <Select
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="الوحدة">
          <Select value={form.unit} onChange={(e) => set("unit", e.target.value)}>
            {UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="سعر الشراء" error={errors.purchasePrice}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.purchasePrice}
            onChange={(e) => set("purchasePrice", Number(e.target.value))}
          />
        </Field>
        <Field label="سعر البيع" error={errors.sellingPrice}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.sellingPrice}
            onChange={(e) => set("sellingPrice", Number(e.target.value))}
          />
        </Field>
        <Field label="الكمية الحالية" error={errors.quantity}>
          <Input
            type="number"
            min={0}
            value={form.quantity}
            onChange={(e) => set("quantity", Number(e.target.value))}
          />
        </Field>
        <Field label="الحد الأدنى للمخزون" error={errors.minStock}>
          <Input
            type="number"
            min={0}
            value={form.minStock}
            onChange={(e) => set("minStock", Number(e.target.value))}
          />
        </Field>
        <Field label="المورد">
          <Select
            value={form.supplierId ?? ""}
            onChange={(e) =>
              set("supplierId", e.target.value ? e.target.value : undefined)
            }
          >
            <option value="">— غير محدد —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="له تاريخ صلاحية؟">
          <div className="flex items-center gap-3 h-9">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hasExp"
                checked={form.hasExpiry}
                onChange={() => set("hasExpiry", true)}
              />
              نعم
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hasExp"
                checked={!form.hasExpiry}
                onChange={() => {
                  set("hasExpiry", false);
                  set("expiryDate", undefined);
                }}
              />
              لا
            </label>
          </div>
        </Field>
        {form.hasExpiry ? (
          <Field label="تاريخ الصلاحية" required error={errors.expiryDate}>
            <Input
              type="date"
              value={form.expiryDate ?? ""}
              onChange={(e) =>
                set("expiryDate", e.target.value || undefined)
              }
            />
          </Field>
        ) : (
          <div />
        )}
        <Field label="ملاحظات" className="col-span-2">
          <Textarea
            rows={2}
            value={form.notes ?? ""}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
