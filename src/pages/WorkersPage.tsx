import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Plus,
  Pencil,
  Eye,
  ToggleLeft,
  ToggleRight,
  TrendingUp,
  UserCheck,
  UserMinus,
  Briefcase,
} from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { EmptyState } from "../components/ui/EmptyState";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input, Select } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import { hasDb } from "../db/client";
import {
  listAllWorkers,
  createWorker,
  updateWorker,
  type WageType,
  type Worker,
} from "../features/workers/queries";
import { useSettings } from "../store/SettingsContext";
import { formatCurrency } from "../lib/format";
import { piastresToEgp, egpToPiastres } from "../lib/money";
import { uid } from "../lib/utils";

const WAGE_LABELS: Record<WageType, string> = {
  daily_fixed: "يومي ثابت",
  monthly: "شهري",
  commission_only: "عمولة فقط",
};

export function WorkersPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const { settings } = useSettings();

  const [workersList, setWorkersList] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [name, setName] = useState("");
  const [wageType, setWageType] = useState<WageType>("daily_fixed");
  const [baseWage, setBaseWage] = useState("");

  const loadWorkers = useCallback(async () => {
    if (!hasDb()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await listAllWorkers();
      setWorkersList(data);
    } catch (err) {
      console.error(err);
      toast.error("فشل في تحميل قائمة الصنايعية");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadWorkers();
  }, [loadWorkers]);

  // Open add modal
  function handleOpenAdd() {
    setEditingWorker(null);
    setName("");
    setWageType("daily_fixed");
    setBaseWage("");
    setDialogOpen(true);
  }

  // Open edit modal
  function handleOpenEdit(worker: Worker) {
    setEditingWorker(worker);
    setName(worker.name);
    setWageType(worker.wageType);
    setBaseWage(worker.baseWage != null ? piastresToEgp(worker.baseWage).toString() : "");
    setDialogOpen(true);
  }

  // Save worker details
  async function handleSaveWorker() {
    if (!name.trim()) {
      toast.error("يرجى إدخال اسم الصنايعي");
      return;
    }
    const wageAmount = baseWage.trim() ? egpToPiastres(baseWage) : null;
    if (wageAmount != null && wageAmount < 0) {
      toast.error("الأجر الأساسي يجب أن يكون موجباً");
      return;
    }

    try {
      if (editingWorker) {
        await updateWorker(editingWorker.id, {
          name: name.trim(),
          wageType,
          baseWage: wageAmount,
        });
        toast.success("تم تحديث بيانات الصنايعي");
      } else {
        await createWorker({
          id: uid("wrk"),
          name: name.trim(),
          wageType,
          baseWage: wageAmount,
          active: true,
        });
        toast.success("تمت إضافة الصنايعي بنجاح");
      }
      setDialogOpen(false);
      loadWorkers();
    } catch (err) {
      console.error(err);
      toast.error("فشل في حفظ البيانات");
    }
  }

  // Toggle active/disabled status
  async function handleToggleStatus(worker: Worker) {
    try {
      await updateWorker(worker.id, { active: !worker.active });
      toast.success(worker.active ? "تم تعطيل الصنايعي" : "تم تفعيل الصنايعي وتنشيطه");
      loadWorkers();
    } catch (err) {
      console.error(err);
      toast.error("فشل في تعديل حالة الصنايعي");
    }
  }

  // Statistics cards computation
  const stats = useMemo(() => {
    const total = workersList.length;
    const active = workersList.filter((w) => w.active).length;
    const monthly = workersList.filter((w) => w.active && w.wageType === "monthly").length;
    const daily = workersList.filter((w) => w.active && w.wageType === "daily_fixed").length;
    const commission = workersList.filter((w) => w.active && w.wageType === "commission_only").length;

    return { total, active, monthly, daily, commission };
  }, [workersList]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-slate-500">
        جاري التحميل...
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 text-right" dir="rtl">
      <PageHeader
        title="إدارة الصنايعية"
        description="إضافة وتعديل بيانات عمال الغسيل وتحديد نظام أجورهم الأساسية."
        actions={
          <Button onClick={handleOpenAdd}>
            <Plus className="w-4 h-4" /> إضافة صنايعي جديد
          </Button>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="إجمالي الصنايعية"
          value={String(stats.total)}
          tone="slate"
        />
        <StatCard
          icon={<UserCheck className="h-5 w-5" />}
          label="نشطين حالياً"
          value={String(stats.active)}
          tone="green"
        />
        <StatCard
          icon={<Briefcase className="h-5 w-5" />}
          label="نظام راتب شهري"
          value={String(stats.monthly)}
          tone="blue"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="نظام يومية ثابتة"
          value={String(stats.daily)}
          tone="amber"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="عمولة فقط"
          value={String(stats.commission)}
          tone="slate"
        />
      </div>

      {/* Workers List Card */}
      <Card>
        <CardBody className="p-0">
          {workersList.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={<Users className="h-8 w-8" />}
                title="لا يوجد صنايعية مسجلين"
                description="ابدأ بإضافة أول صنايعي للمغسلة لربطه بفواتير الغسيل اليومية."
              />
            </div>
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>الصنايعي</TH>
                  <TH>نظام الأجر</TH>
                  <TH className="text-end">الأجر الأساسي</TH>
                  <TH>الحالة</TH>
                  <TH className="text-end w-40">إجراءات</TH>
                </TR>
              </THead>
              <TBody>
                {workersList.map((worker) => (
                  <TR key={worker.id} className={!worker.active ? "text-slate-400 bg-slate-50/50" : undefined}>
                    <TD className="font-medium">
                      <Link to={`/workers/${worker.id}`} className="text-brand-700 hover:underline text-base font-semibold">
                        {worker.name}
                      </Link>
                    </TD>
                    <TD>{WAGE_LABELS[worker.wageType]}</TD>
                    <TD className="text-end font-semibold">
                      {worker.baseWage != null ? formatCurrency(piastresToEgp(worker.baseWage), settings.currency) : "—"}
                    </TD>
                    <TD>
                      <Badge tone={worker.active ? "green" : "slate"}>
                        {worker.active ? "نشط" : "معطل"}
                      </Badge>
                    </TD>
                    <TD className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          title="كشف الحساب"
                          onClick={() => navigate(`/workers/${worker.id}`)}
                          className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye className="w-4 h-4 ml-1" />
                          كشف الحساب
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title="تعديل"
                          onClick={() => handleOpenEdit(worker)}
                          className="h-8 px-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100"
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          title={worker.active ? "تعطيل" : "تفعيل"}
                          onClick={() => handleToggleStatus(worker)}
                          className={`h-8 px-2 ${
                            worker.active ? "text-amber-600 hover:text-amber-700 hover:bg-amber-50" : "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          }`}
                        >
                          {worker.active ? (
                            <UserMinus className="w-4 h-4" />
                          ) : (
                            <UserCheck className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Add / Edit Dialog */}
      <Dialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        title={editingWorker ? "تعديل بيانات الصنايعي" : "إضافة صنايعي جديد"}
        footer={
          <>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSaveWorker}>حفظ</Button>
          </>
        }
      >
        <div className="space-y-4 text-start" dir="rtl">
          <Field label="اسم الصنايعي بالكامل" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد مصطفى"
              autoFocus
            />
          </Field>
          <Field label="نظام الأجر للعمل اليومي" required>
            <Select value={wageType} onChange={(e) => setWageType(e.target.value as WageType)}>
              <option value="daily_fixed">يومي ثابت (يتقاضى مبلغ محدد يومياً)</option>
              <option value="monthly">شهري (ينقسم الراتب على عدد أيام الشهر)</option>
              <option value="commission_only">عمولة فقط (لا يوجد راتب أساسي)</option>
            </Select>
          </Field>
          {wageType !== "commission_only" && (
            <Field
              label={wageType === "monthly" ? "الراتب الشهري الأساسي" : "أجر اليومية الثابت"}
              required
              hint={
                wageType === "monthly"
                  ? "يتم توزيعه على أيام العمل الفردية في إقفال اليوم."
                  : "مبلغ ثابت يضاف لمستحقاته عند حضور اليوم."
              }
            >
              <Input
                type="number"
                min="0"
                step="0.5"
                placeholder="0.00"
                value={baseWage}
                onChange={(e) => setBaseWage(e.target.value)}
              />
            </Field>
          )}
        </div>
      </Dialog>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: "blue" | "green" | "amber" | "slate";
}) {
  const tones: Record<typeof tone, string> = {
    blue: "bg-blue-50 text-blue-700 border-blue-100",
    green: "bg-emerald-50 text-emerald-700 border-emerald-100",
    amber: "bg-amber-50 text-amber-700 border-amber-100",
    slate: "bg-slate-50 text-slate-700 border-slate-100",
  };

  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className={`grid h-12 w-12 place-items-center rounded-xl ${tones[tone]} border`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-slate-500 font-medium">{label}</div>
        <div className="text-lg font-bold text-slate-900 mt-1">{value}</div>
      </div>
    </div>
  );
}
