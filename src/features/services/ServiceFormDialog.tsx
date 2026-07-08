import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field, Input, Select, Textarea } from "../../components/ui/Input";
import { useToast } from "../../components/ui/Toast";
import { useCarwash } from "../../store/CarwashContext";
import { hasDb } from "../../db/client";
import { listActiveRawMaterials, type RawMaterial } from "../../features/materials/queries";
import { uid } from "../../lib/utils";
import type { ServiceMaterial, WashService, WashServiceCategory, WashType } from "../../types";

type FormState = Omit<WashService, "id" | "createdAt">;

const EMPTY: FormState = {
  name: "",
  category: "wash",
  defaultPrice: 0,
  hasCommission: false,
  pricingMode: "variable",
  active: true,
  washType: undefined,
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
  const toast = useToast();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dbMaterials, setDbMaterials] = useState<RawMaterial[]>([]);

  useEffect(() => {
    if (open && hasDb()) {
      listActiveRawMaterials().then(setDbMaterials).catch(() => {});
    }
  }, [open]);

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
    const firstMaterial = dbMaterials[0];
    if (!firstMaterial) {
      toast.error("لا توجد خامات في المخزون لربطها — أضف خامات من صفحة خامات الغسيل");
      return;
    }
    const row: ServiceMaterial = { id: uid("mat"), materialId: firstMaterial.id, quantity: 1 };
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
      materials: materials.filter((m) => m.materialId && m.quantity > 0),
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
        {editing?.code && (
          <Field label="كود الخدمة">
            <Input value={editing.code} disabled className="font-mono bg-slate-50 text-slate-500" />
          </Field>
        )}
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
            <option value="chemical">كيماوي</option>
            <option value="extra">خدمة إضافية</option>
          </Select>
        </Field>

        <Field label="وضع التسعير">
          <Select
            value={form.pricingMode ?? "variable"}
            onChange={(e) => set("pricingMode", e.target.value as "variable" | "fixed")}
          >
            <option value="variable">يدوي كل مرة</option>
            <option value="fixed">سعر ثابت افتراضي</option>
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
        <Field label="تصنيف الغسيل في التقارير">
          <Select
            value={form.washType ?? ""}
            onChange={(e) => set("washType", (e.target.value || undefined) as WashType | undefined)}
          >
            <option value="">غير محدد (يُحدَّد من الاسم)</option>
            <option value="exterior">خارجي فقط</option>
            <option value="interior">داخلي فقط</option>
            <option value="full">خارجي + داخلي</option>
            <option value="none">لا علاقة له بالغسيل</option>
          </Select>
        </Field>
        <Field label="عمولة صنايعي" hint={form.hasCommission ? "مبلغ العمولة يُدخل في الفاتورة ولا يظهر للعميل" : undefined}>
          <div className="flex items-center gap-3 h-9 flex-wrap">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form.hasCommission)}
                onChange={(e) => set("hasCommission", e.target.checked)}
              />
              تدخل في العمولة
            </label>
          </div>
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
          {dbMaterials.length === 0 ? (
            <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">
              لا توجد خامات في المخزون — أضف الشامبو والواكس وغيرها من صفحة "خامات الغسيل" أولاً.
            </div>
          ) : materials.length === 0 ? (
            <div className="text-xs text-slate-400 border border-dashed border-slate-200 rounded-lg p-3 text-center">
              لا توجد خامات مرتبطة — اربط الخامات لتُخصم من المخزون تلقائياً عند الفوترة.
            </div>
          ) : (
            <div className="space-y-2">
              {materials.map((m) => {
                const material = dbMaterials.find((p) => p.id === m.materialId);
                return (
                  <div key={m.id} className="flex items-center gap-2">
                    <Select
                      value={m.materialId}
                      onChange={(e) => updateMaterial(m.id, { materialId: e.target.value })}
                      className="flex-1"
                    >
                      {dbMaterials.map((p) => (
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
                    <span className="text-xs text-slate-500 w-16 shrink-0">{material?.unit ?? ""}</span>
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
