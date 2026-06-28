import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Pencil, Plus, Power } from "lucide-react";
import { PageHeader } from "../components/layout/AppLayout";
import { Card, CardBody, CardHeader } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Dialog } from "../components/ui/Dialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Field, Input } from "../components/ui/Input";
import { Table, TBody, TD, TH, THead, TR } from "../components/ui/Table";
import { useToast } from "../components/ui/Toast";
import { hasDb } from "../db/client";
import type { Branch } from "../db/schema";
import { useSettings } from "../store/SettingsContext";
import { uid } from "../lib/utils";
import {
  createBranch,
  ensureDefaultBranch,
  listBranches,
  MAIN_BRANCH_ID,
  saveCurrentBranch,
  updateBranch,
} from "../features/branches/queries";

function branchFallbackName(name?: string) {
  return name?.trim() || "فرع بدون اسم";
}

function BranchForm({
  open,
  initial,
  onClose,
  onSave,
}: {
  open: boolean;
  initial?: Branch | null;
  onClose: () => void;
  onSave: (name: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");

  useEffect(() => {
    if (open) setName(initial?.name ?? "");
  }, [open, initial]);

  const trimmed = name.trim();

  return (
    <Dialog open={open} onClose={onClose} title={initial ? "تعديل فرع" : "فرع جديد"}>
      <div className="space-y-4">
        <Field label="اسم الفرع" required>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: فرع التجمع"
            autoFocus
          />
        </Field>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>
            إلغاء
          </Button>
          <Button onClick={() => onSave(trimmed)} disabled={!trimmed}>
            حفظ
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export function BranchesPage() {
  const toast = useToast();
  const { settings, updateSettings } = useSettings();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Branch | null>(null);

  const currentBranchId = settings.currentBranchId || MAIN_BRANCH_ID;

  const load = useCallback(async () => {
    if (!hasDb()) {
      setLoading(false);
      return;
    }

    try {
      await ensureDefaultBranch();
      const next = await listBranches();
      setBranches(next);

      const active = next.filter((branch) => branch.active);
      const selected = next.find((branch) => branch.id === currentBranchId && branch.active);
      const fallback = selected ?? active[0] ?? next[0];
      if (fallback && (settings.currentBranchId !== fallback.id || settings.branchName !== fallback.name)) {
        await saveCurrentBranch(fallback);
        updateSettings({ currentBranchId: fallback.id, branchName: fallback.name });
      }
    } catch {
      toast.error("تعذر تحميل الفروع");
    } finally {
      setLoading(false);
    }
  }, [currentBranchId, settings.branchName, settings.currentBranchId, toast, updateSettings]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeBranches = useMemo(() => branches.filter((branch) => branch.active), [branches]);
  const inactiveBranches = useMemo(() => branches.filter((branch) => !branch.active), [branches]);
  const currentBranch = useMemo(
    () => branches.find((branch) => branch.id === currentBranchId),
    [branches, currentBranchId]
  );

  async function saveBranch(name: string) {
    if (!hasDb()) {
      toast.error("قاعدة البيانات غير متاحة");
      return;
    }

    try {
      if (editing) {
        await updateBranch(editing.id, { name });
        if (editing.id === currentBranchId) {
          await saveCurrentBranch({ id: editing.id, name });
          updateSettings({ branchName: name });
        }
        toast.success("تم تحديث الفرع");
      } else {
        await createBranch({
          id: uid("branch"),
          name,
          active: true,
          createdAt: new Date().toISOString(),
        });
        toast.success("تمت إضافة الفرع");
      }
      setEditing(null);
      setFormOpen(false);
      await load();
    } catch {
      toast.error("تعذر حفظ الفرع");
    }
  }

  async function selectBranch(branch: Branch) {
    if (!branch.active) return;
    if (!hasDb()) {
      toast.error("قاعدة البيانات غير متاحة");
      return;
    }
    try {
      await saveCurrentBranch(branch);
      updateSettings({ currentBranchId: branch.id, branchName: branchFallbackName(branch.name) });
      toast.success("تم اختيار الفرع الحالي", branchFallbackName(branch.name));
    } catch {
      toast.error("تعذر اختيار الفرع");
    }
  }

  async function toggleBranch(branch: Branch) {
    if (!hasDb()) return;
    if (branch.id === currentBranchId && branch.active) {
      toast.error("لا يمكن تعطيل الفرع الحالي", "اختار فرع آخر أولاً ثم عطّل هذا الفرع");
      return;
    }

    try {
      await updateBranch(branch.id, { active: !branch.active });
      toast.success(branch.active ? "تم تعطيل الفرع" : "تم تفعيل الفرع");
      await load();
    } catch {
      toast.error("تعذر تحديث حالة الفرع");
    }
  }

  if (loading) {
    return <div className="flex h-48 items-center justify-center text-slate-500">جاري التحميل...</div>;
  }

  return (
    <>
      <PageHeader
        title="الفروع"
        description="أساس إدارة أكثر من فرع بدون أي اعتماد على الإنترنت. الفرع الحالي يظهر في أعلى النظام ويجهّز التقارير للتقسيم لاحقاً."
        actions={
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> فرع جديد
          </Button>
        }
      />

      {!hasDb() ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Building2 className="h-8 w-8" />}
              title="إدارة الفروع متاحة في نسخة سطح المكتب"
              description="هذه الصفحة تحتاج قاعدة بيانات SQLite المحلية."
            />
          </CardBody>
        </Card>
      ) : (
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="الفرع الحالي"
              subtitle="كل تشغيل أو تقرير جديد سيحمل هذا الفرع كسياق العمل الحالي."
            />
            <CardBody>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 place-items-center rounded-lg bg-white text-emerald-700 shadow-sm">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold text-slate-900">
                      {branchFallbackName(currentBranch?.name ?? settings.branchName)}
                    </div>
                    <div className="text-xs text-slate-500">معرّف الفرع: {currentBranchId}</div>
                  </div>
                </div>
                <Badge tone="emerald">
                  <CheckCircle2 className="h-3 w-3" /> نشط
                </Badge>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="الفروع النشطة"
              subtitle={`${activeBranches.length} فرع متاح للاختيار`}
            />
            <CardBody className="p-0">
              {activeBranches.length === 0 ? (
                <EmptyState
                  icon={<Building2 className="h-8 w-8" />}
                  title="لا توجد فروع نشطة"
                  description="أضف فرعاً أو فعّل فرعاً موجوداً للمتابعة."
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>الفرع</TH>
                      <TH className="w-36">الحالة</TH>
                      <TH className="w-52"></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {activeBranches.map((branch) => {
                      const selected = branch.id === currentBranchId;
                      return (
                        <TR key={branch.id}>
                          <TD>
                            <div className="font-medium text-slate-900">{branchFallbackName(branch.name)}</div>
                            <div className="text-xs text-slate-400">{branch.id}</div>
                          </TD>
                          <TD>
                            {selected ? <Badge tone="emerald">الفرع الحالي</Badge> : <Badge>نشط</Badge>}
                          </TD>
                          <TD>
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                variant={selected ? "secondary" : "outline"}
                                size="sm"
                                onClick={() => selectBranch(branch)}
                                disabled={selected}
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                {selected ? "مختار" : "اختيار"}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="تعديل"
                                onClick={() => { setEditing(branch); setFormOpen(true); }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                title="تعطيل"
                                onClick={() => toggleBranch(branch)}
                                disabled={selected}
                              >
                                <Power className="h-4 w-4" />
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

          {inactiveBranches.length > 0 ? (
            <Card className="opacity-75">
              <CardHeader title={`فروع معطّلة (${inactiveBranches.length})`} />
              <CardBody className="p-0">
                <Table>
                  <THead>
                    <TR>
                      <TH>الفرع</TH>
                      <TH className="w-32">الحالة</TH>
                      <TH className="w-32"></TH>
                    </TR>
                  </THead>
                  <TBody>
                    {inactiveBranches.map((branch) => (
                      <TR key={branch.id}>
                        <TD>
                          <div className="font-medium text-slate-700">{branchFallbackName(branch.name)}</div>
                          <div className="text-xs text-slate-400">{branch.id}</div>
                        </TD>
                        <TD><Badge tone="slate">معطّل</Badge></TD>
                        <TD>
                          <Button variant="outline" size="sm" onClick={() => toggleBranch(branch)}>
                            تفعيل
                          </Button>
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              </CardBody>
            </Card>
          ) : null}
        </div>
      )}

      <BranchForm
        open={formOpen}
        initial={editing}
        onClose={() => { setFormOpen(false); setEditing(null); }}
        onSave={saveBranch}
      />
    </>
  );
}
