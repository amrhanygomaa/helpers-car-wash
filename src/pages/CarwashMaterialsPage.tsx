import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Beaker,
  Pencil,
  Plus,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input, Select } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { hasDb } from "../db/client";
import {
  createRawMaterial,
  listAllRawMaterials,
  recordMaterialConsumption,
  recordMaterialPurchase,
  updateRawMaterial,
  type RawMaterial,
} from "../features/materials/queries";
import { listActiveWorkers, type Worker } from "../features/workers/queries";
import { hasPermissionKey } from "../lib/permissions";
import { egpToPiastres, piastresToEgp } from "../lib/money";
import { todayISO, uid } from "../lib/utils";
import { useAuth } from "../store/AuthContext";
import { useSettings } from "../store/SettingsContext";

const CURRENCY = "ج.م";
const UNIT_OPTIONS = [
  { value: "piece", label: "قطعة" },
  { value: "liter", label: "لتر" },
  { value: "kg", label: "كيلو" },
  { value: "ml", label: "مل" },
  { value: "box", label: "عبوة" },
];

function fmtEgp(piastres: number): string {
  return `${piastresToEgp(piastres).toFixed(2)} ${CURRENCY}`;
}

function unitLabel(unit: string): string {
  return UNIT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;
}

interface MaterialFormProps {
  open: boolean;
  initial?: RawMaterial | null;
  onSave: (data: {
    name: string;
    unit: string;
    unitCost: number;
    stockQty: number;
    lowStockThreshold: number;
  }) => void;
  onClose: () => void;
}

function MaterialForm({ open, initial, onSave, onClose }: MaterialFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState(initial?.unit ?? "piece");
  const [unitCost, setUnitCost] = useState(initial ? piastresToEgp(initial.unitCost).toString() : "");
  const [stockQty, setStockQty] = useState(initial?.stockQty.toString() ?? "0");
  const [threshold, setThreshold] = useState(initial?.lowStockThreshold.toString() ?? "5");

  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? "");
    setUnit(initial?.unit ?? "piece");
    setUnitCost(initial ? piastresToEgp(initial.unitCost).toString() : "");
    setStockQty(initial?.stockQty.toString() ?? "0");
    setThreshold(initial?.lowStockThreshold.toString() ?? "5");
  }, [open, initial]);

  function handleSave() {
    const cost = parseFloat(unitCost || "0");
    const qty = parseInt(stockQty || "0", 10);
    const low = parseInt(threshold || "5", 10);
    if (!name.trim()) return;
    if (!Number.isFinite(cost) || cost < 0) return;
    if (!Number.isFinite(qty) || qty < 0) return;
    onSave({
      name: name.trim(),
      unit,
      unitCost: egpToPiastres(cost),
      stockQty: qty,
      lowStockThreshold: Number.isFinite(low) && low >= 0 ? low : 5,
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={initial ? "تعديل خامة" : "خامة جديدة"}>
      <div className="space-y-4">
        <Field label="اسم الخامة" required>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثال: شامبو خارجي" />
        </Field>
        <Field label="الوحدة" required>
          <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNIT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={`تكلفة الوحدة (${CURRENCY})`}>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        </Field>
        <Field label="رصيد البداية" hint="يُستخدم عند إنشاء خامة لأول مرة أو تصحيح الرصيد يدوياً.">
          <Input
            type="number"
            min={0}
            step="1"
            value={stockQty}
            onChange={(e) => setStockQty(e.target.value)}
          />
        </Field>
        <Field label="حد التنبيه" hint="ينبّه عند وصول الرصيد لهذا الرقم أو أقل.">
          <Input
            type="number"
            min={0}
            step="1"
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={!name.trim()}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

interface MovementDialogProps {
  mode: "purchase" | "consumption";
  open: boolean;
  material: RawMaterial | null;
  workers: Worker[];
  onSave: (qty: number, unitCost: number, byWorkerId?: string) => void;
  onClose: () => void;
}

function MovementDialog({ mode, open, material, workers, onSave, onClose }: MovementDialogProps) {
  const [qty, setQty] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [byWorkerId, setByWorkerId] = useState("");

  useEffect(() => {
    if (!open || !material) return;
    setQty("1");
    setUnitCost(piastresToEgp(material.unitCost).toString());
    setByWorkerId("");
  }, [open, material]);

  const parsedQty = parseInt(qty || "0", 10);
  const isConsumption = mode === "consumption";
  const exceedsStock = isConsumption && material ? parsedQty > material.stockQty : false;

  function handleSave() {
    const q = parseInt(qty || "0", 10);
    const cost = parseFloat(unitCost || "0");
    if (!Number.isFinite(q) || q <= 0) return;
    if (!Number.isFinite(cost) || cost < 0) return;
    if (isConsumption && material && q > material.stockQty) return;
    onSave(q, egpToPiastres(cost), byWorkerId || undefined);
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${isConsumption ? "تسجيل استهلاك" : "تسجيل توريد"} — ${material?.name ?? ""}`}
    >
      <div className="space-y-4">
        {material ? (
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
            الرصيد الحالي: <span className="font-semibold text-slate-900">{material.stockQty}</span>{" "}
            {unitLabel(material.unit)}
          </div>
        ) : null}
        <Field label="الكمية" required error={exceedsStock ? "الكمية أكبر من الرصيد المتاح" : undefined}>
          <Input type="number" min={1} step="1" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={`تكلفة الوحدة (${CURRENCY})`}>
          <Input
            type="number"
            min={0}
            step="0.5"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
          />
        </Field>
        {isConsumption ? (
          <Field label="العامل" hint="اختياري، لتتبع الاستهلاك اليومي حسب العامل.">
            <Select value={byWorkerId} onChange={(e) => setByWorkerId(e.target.value)}>
              <option value="">بدون عامل محدد</option>
              {workers.map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {worker.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={parsedQty <= 0 || exceedsStock}>
            {isConsumption ? "تسجيل الاستهلاك" : "إضافة رصيد"}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function CarwashMaterialsPage() {
  const { currentUser } = useAuth();
  const { settings } = useSettings();
  const toast = useToast();
  const branchId = settings.currentBranchId || "branch-main";
  const canManage = hasPermissionKey(currentUser, "materials.manage");

  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<RawMaterial | null>(null);
  const [purchaseMaterial, setPurchaseMaterial] = useState<RawMaterial | null>(null);
  const [consumptionMaterial, setConsumptionMaterial] = useState<RawMaterial | null>(null);

  const load = useCallback(async () => {
    if (!hasDb()) {
      setLoading(false);
      return;
    }
    try {
      const [allMaterials, activeWorkers] = await Promise.all([
        listAllRawMaterials(),
        listActiveWorkers(),
      ]);
      setMaterials(allMaterials);
      setWorkers(activeWorkers);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activeMaterials = useMemo(() => materials.filter((m) => m.active), [materials]);
  const inactiveMaterials = useMemo(() => materials.filter((m) => !m.active), [materials]);
  const lowStockCount = useMemo(
    () => activeMaterials.filter((m) => m.stockQty <= m.lowStockThreshold).length,
    [activeMaterials]
  );

  async function handleSaveMaterial(data: {
    name: string;
    unit: string;
    unitCost: number;
    stockQty: number;
    lowStockThreshold: number;
  }) {
    if (!hasDb()) {
      toast.error("قاعدة البيانات غير متاحة");
      return;
    }
    try {
      if (editing) {
        await updateRawMaterial(editing.id, data);
        toast.success("تم تحديث الخامة");
      } else {
        await createRawMaterial({ id: uid("mat"), active: true, ...data });
        toast.success("تمت إضافة الخامة");
      }
      setFormOpen(false);
      setEditing(null);
      load();
    } catch {
      toast.error("حدث خطأ أثناء الحفظ");
    }
  }

  async function handlePurchase(qty: number, unitCost: number) {
    if (!purchaseMaterial || !hasDb()) return;
    try {
      await recordMaterialPurchase({
        movementId: uid("matmov"),
        materialId: purchaseMaterial.id,
        qty,
        unitCost,
        branchId,
        businessDate: todayISO(),
        byUserId: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      toast.success(`تم إضافة ${qty} ${unitLabel(purchaseMaterial.unit)} لـ ${purchaseMaterial.name}`);
      setPurchaseMaterial(null);
      load();
    } catch {
      toast.error("حدث خطأ أثناء تسجيل التوريد");
    }
  }

  async function handleConsumption(qty: number, unitCost: number, byWorkerId?: string) {
    if (!consumptionMaterial || !hasDb()) return;
    try {
      await recordMaterialConsumption({
        movementId: uid("matmov"),
        materialId: consumptionMaterial.id,
        qty,
        unitCost,
        branchId,
        businessDate: todayISO(),
        byWorkerId,
        byUserId: currentUser?.id,
        createdAt: new Date().toISOString(),
      });
      toast.success(`تم تسجيل استهلاك ${qty} ${unitLabel(consumptionMaterial.unit)}`);
      setConsumptionMaterial(null);
      load();
    } catch (error) {
      if (error instanceof Error && error.message === "insufficient_stock") {
        toast.error("لا يمكن تسجيل استهلاك أكبر من الرصيد المتاح");
      } else {
        toast.error("حدث خطأ أثناء تسجيل الاستهلاك");
      }
    }
  }

  async function handleToggleActive(material: RawMaterial) {
    if (!hasDb()) return;
    try {
      await updateRawMaterial(material.id, { active: !material.active });
      toast.success(material.active ? "تم تعطيل الخامة" : "تم تفعيل الخامة");
      load();
    } catch {
      toast.error("حدث خطأ");
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-slate-500">جاري التحميل...</div>;
  }

  if (!hasDb()) {
    return (
      <>
        <PageHeader title="خامات الغسيل" description="إدارة رصيد واستهلاك خامات التشغيل اليومية." />
        <EmptyState
          icon={<Beaker className="h-8 w-8" />}
          title="قاعدة البيانات غير متاحة"
          description="هذه الصفحة تعمل من نسخة سطح المكتب المتصلة بقاعدة البيانات."
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="خامات الغسيل"
        description="كتالوج الخامات، الرصيد المتاح، والاستهلاك اليومي حسب العامل أو المستخدم."
        actions={
          canManage ? (
            <Button
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> خامة جديدة
            </Button>
          ) : null
        }
      />

      {lowStockCount > 0 ? (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>{lowStockCount} خامة وصلت لحد التنبيه أو أقل.</span>
        </div>
      ) : null}

      <Card>
        <CardHeader title="الخامات الفعالة" />
        <CardBody className="p-0">
          {activeMaterials.length === 0 ? (
            <EmptyState
              icon={<Beaker className="h-8 w-8" />}
              title="لا توجد خامات بعد"
              description="أضف خامات التشغيل مثل الشامبو، الواكس، الفوط، أو أي مستهلكات يومية."
              action={
                canManage ? (
                  <Button
                    onClick={() => {
                      setEditing(null);
                      setFormOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4" /> خامة جديدة
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الخامة</TH>
                  <TH className="w-24">الوحدة</TH>
                  <TH className="w-28">الرصيد</TH>
                  <TH className="w-28">حد التنبيه</TH>
                  <TH className="w-32">تكلفة الوحدة</TH>
                  <TH className="w-24">الحالة</TH>
                  {canManage ? <TH className="w-44"></TH> : null}
                </TR>
              </THead>
              <TBody>
                {activeMaterials.map((material) => {
                  const isLow = material.stockQty <= material.lowStockThreshold;
                  return (
                    <TR key={material.id}>
                      <TD>
                        <div className="font-medium">{material.name}</div>
                        {isLow ? (
                          <Badge tone="amber" className="mt-0.5">
                            <AlertTriangle className="h-3 w-3" /> رصيد منخفض
                          </Badge>
                        ) : null}
                      </TD>
                      <TD>{unitLabel(material.unit)}</TD>
                      <TD>
                        <span className={isLow ? "font-bold text-amber-700" : "font-medium text-slate-900"}>
                          {material.stockQty}
                        </span>
                      </TD>
                      <TD className="text-slate-600">{material.lowStockThreshold}</TD>
                      <TD className="font-medium">{fmtEgp(material.unitCost)}</TD>
                      <TD>
                        <Badge tone={isLow ? "amber" : "green"}>{isLow ? "تنبيه" : "مستقر"}</Badge>
                      </TD>
                      {canManage ? (
                        <TD>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPurchaseMaterial(material)}
                              className="p-1.5 text-slate-400 transition-colors hover:text-green-700"
                              title="تسجيل توريد"
                            >
                              <ArrowUpCircle className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConsumptionMaterial(material)}
                              className="p-1.5 text-slate-400 transition-colors hover:text-rose-700"
                              title="تسجيل استهلاك"
                            >
                              <ArrowDownCircle className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditing(material);
                                setFormOpen(true);
                              }}
                              className="p-1.5 text-slate-400 transition-colors hover:text-blue-600"
                              title="تعديل"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleToggleActive(material)}
                              className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-600"
                            >
                              تعطيل
                            </button>
                          </div>
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {inactiveMaterials.length > 0 ? (
        <Card className="mt-4 opacity-70">
          <CardHeader title={`خامات معطلة (${inactiveMaterials.length})`} />
          <CardBody className="p-0">
            <Table>
              <THead>
                <TR>
                  <TH>الخامة</TH>
                  <TH className="w-24">الوحدة</TH>
                  <TH className="w-28">الرصيد</TH>
                  {canManage ? <TH className="w-24"></TH> : null}
                </TR>
              </THead>
              <TBody>
                {inactiveMaterials.map((material) => (
                  <TR key={material.id} className="text-slate-400">
                    <TD>{material.name}</TD>
                    <TD>{unitLabel(material.unit)}</TD>
                    <TD>{material.stockQty}</TD>
                    {canManage ? (
                      <TD>
                        <button
                          type="button"
                          onClick={() => handleToggleActive(material)}
                          className="rounded border border-slate-200 px-1.5 py-1 text-xs text-slate-500 transition-colors hover:text-green-700"
                        >
                          تفعيل
                        </button>
                      </TD>
                    ) : null}
                  </TR>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}

      <MaterialForm
        open={formOpen}
        initial={editing}
        onSave={handleSaveMaterial}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />
      <MovementDialog
        mode="purchase"
        open={purchaseMaterial != null}
        material={purchaseMaterial}
        workers={workers}
        onSave={handlePurchase}
        onClose={() => setPurchaseMaterial(null)}
      />
      <MovementDialog
        mode="consumption"
        open={consumptionMaterial != null}
        material={consumptionMaterial}
        workers={workers}
        onSave={handleConsumption}
        onClose={() => setConsumptionMaterial(null)}
      />
    </>
  );
}
