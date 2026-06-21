import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useCarwash } from "../../store/CarwashContext";
import { useCatalog } from "../../store/CatalogContext";
import { uid } from "../../lib/utils";
import type { ServiceMaterial, WashService, WashServiceCategory } from "../../types";

type FormState = Omit<WashService, "id" | "createdAt">;

const EMPTY: FormState = {
  name: "",
  category: "wash",
  defaultPrice: 0,
  active: true,
  materials: [],
  notes: "",
};

export function ServiceFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: WashService | null;
}) {
  const { addWashService, updateWashService } = useCarwash();
  const { products } = useCatalog();
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (editing) {
      const { id: _id, createdAt: _c, ...rest } = editing;
      void _id;
      void _c;
      setForm({ ...rest, materials: rest.materials ?? [] });
    } else {
      setForm(EMPTY);
    }
    setErrors({});
  }, [editing, open]);

  function set<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((f) => ({ ...f, [key]: val }));
  }

  const materials = form.materials ?? [];

  function addMaterialRow() {
    const firstProduct = products[0];
    if (!firstProduct) {
      toast.error("لا توجد منتجات في المخزون لربطها");
      return;
    }
    const row: ServiceMaterial = { id: uid("mat"), productId: firstProduct.id, quantity: 1 };
    set("materials", [...materials, row]);
  }

  function updateMaterial(id: string, patch: Partial<ServiceMaterial>) {
    set(
      "materials",
      materials.map((m) => (m.id === id ? { ...m, ...patch } : m))
    );
  }

  function removeMaterial(id: string) {
    set("materials", materials.filter((m) => m.id !== id));
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = "اسم الخدمة مطلوب";
    if (form.defaultPrice < 0) e.defaultPrice = "يجب أن يكون موجباً";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit() {
    if (!validate()) return;
    const payload: FormState = {
      ...form,
      name: form.name.trim(),
      notes: form.notes?.trim(),
      materials: materials.filter((m) => m.productId && m.quantity > 0),
    };
    if (editing) {
      updateWashService(editing.id, payload);
      toast.success("تم تحديث الخدمة");
    } else {
      addWashService(payload);
      toast.success("تمت إضافة الخدمة");
    }
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "تعديل خدمة" : "إضافة خدمة غسيل"}
      subtitle="عرّف الخدمة وسعرها الافتراضي والخامات المستهلكة عند تنفيذها"
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSubmit}>{editing ? "حفظ التعديلات" : "إضافة الخدمة"}</Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Field label="اسم الخدمة" required error={errors.name}>
          <Input
            value={form.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="مثل: غسيل خارجي، تلميع، غسيل محرك"
            autoFocus
          />
        </Field>
        <Field label="النوع">
          <Select
            value={form.category}
            onChange={(e) => set("category", e.target.value as WashServiceCategory)}
          >
            <option value="wash">خدمة غسيل</option>
            <option value="extra">خدمة إضافية</option>
          </Select>
        </Field>

        <Field label="السعر الافتراضي" required error={errors.defaultPrice}>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={form.defaultPrice}
            onChange={(e) => set("defaultPrice", Number(e.target.value))}
          />
        </Field>
        <Field label="الحالة">
          <div className="flex items-center gap-3 h-9">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="active" checked={form.active} onChange={() => set("active", true)} />
              مفعّلة
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="active" checked={!form.active} onChange={() => set("active", false)} />
              غير مفعّلة
            </label>
          </div>
        </Field>

        {/* Material BOM — consumed from inventory when the service is invoiced */}
        <div className="col-span-2">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-slate-600">
              الخامات المستهلكة (تُخصم من المخزون تلقائياً)
            </label>
            <Button type="button" variant="outline" size="sm" onClick={addMaterialRow}>
              <Plus className="w-4 h-4" /> إضافة خامة
            </Button>
          </div>
          {materials.length === 0 ? (
            <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">
              لا توجد خامات مرتبطة — يمكن إضافة الشامبو والواكس وغيرها لخصمها عند الفوترة.
            </div>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => {
                const product = products.find((p) => p.id === m.productId);
                const hasPieces = Boolean(product?.piecesPerUnit);
                const unitLabel = m.isRetailUnit
                  ? product?.retailUnit ?? "قطعة"
                  : product?.unit ?? "";
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <Select
                      value={m.productId}
                      onChange={(e) => updateMaterial(m.id, { productId: e.target.value })}
                      className="flex-1"
                    >
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={m.quantity}
                      onChange={(e) => updateMaterial(m.id, { quantity: Number(e.target.value) })}
                      className="w-24"
                    />
                    <span className="text-xs text-slate-500 w-16 shrink-0">{unitLabel}</span>
                    {hasPieces ? (
                      <label className="flex items-center gap-1 text-xs text-slate-600 shrink-0">
                        <input
                          type="checkbox"
                          checked={Boolean(m.isRetailUnit)}
                          onChange={(e) => updateMaterial(m.id, { isRetailUnit: e.target.checked })}
                        />
                        بالقطعة
                      </label>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeMaterial(m.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors shrink-0"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <Field label="ملاحظات" className="col-span-2">
          <Textarea rows={2} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}
