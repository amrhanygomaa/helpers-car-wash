import { useMemo, useState } from "react";
import { Users, Plus, Shield, Trash2, Edit } from "lucide-react";
import { useUsers } from "../store/UsersContext";
import { Button } from "../components/ui/Button";
import { ConfirmDialog, Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import type { AppUser, UserPermissions } from "../types";
import { hashPassword } from "../lib/auth";
import {
  PERMISSION_GROUPS,
  areAllPermissionsEnabled,
  createPermissions,
  normalizePermissions,
  setPermission,
  setPermissionGroup,
} from "../lib/permissions";

function UserFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: AppUser | null;
}) {
  const { addUser, updateUser, users } = useUsers();
  const toast = useToast();

  const [name, setName] = useState(editing?.name || editing?.username || "");
  const [username, setUsername] = useState(editing?.username || "");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<UserPermissions>(
    normalizePermissions(editing?.permissions)
  );
  const [monthlySalary, setMonthlySalary] = useState(
    editing?.monthlySalary === undefined ? "" : String(editing.monthlySalary)
  );
  const [salesCommissionPct, setSalesCommissionPct] = useState(
    editing?.salesCommissionPct === undefined ? "" : String(editing.salesCommissionPct)
  );
  const [monthlySalesTarget, setMonthlySalesTarget] = useState(
    editing?.monthlySalesTarget === undefined ? "" : String(editing.monthlySalesTarget)
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const allPermissionsSelected = useMemo(
    () => areAllPermissionsEnabled(permissions),
    [permissions]
  );

  function optionalNumber(value: string) {
    return value.trim() === "" ? undefined : Number(value);
  }

  async function handleSave() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "مطلوب";
    if (!username.trim()) e.username = "مطلوب";
    const normalizedUsername = username.trim().toLowerCase();
    const usernameExists = users.some(
      (user) => user.id !== editing?.id && user.username.toLowerCase() === normalizedUsername
    );
    if (usernameExists) e.username = "اسم الدخول مستخدم بالفعل";
    if (!editing && !password) e.password = "مطلوب";
    const salary = optionalNumber(monthlySalary);
    const commission = optionalNumber(salesCommissionPct);
    const target = optionalNumber(monthlySalesTarget);
    if (salary !== undefined && salary < 0) e.monthlySalary = "يجب أن يكون موجباً";
    if (commission !== undefined && (commission < 0 || commission > 100)) {
      e.salesCommissionPct = "النسبة يجب أن تكون بين 0 و 100";
    }
    if (target !== undefined && target < 0) e.monthlySalesTarget = "يجب أن يكون موجباً";
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    setSaving(true);
    const employeeFields =
      editing?.role !== "owner"
        ? {
            monthlySalary: salary,
            salesCommissionPct: commission,
            monthlySalesTarget: target,
          }
        : {};
    if (editing) {
      const patch: Partial<AppUser> = {
        name: name.trim(),
        username: username.trim(),
        permissions,
        ...employeeFields,
      };
      if (password) patch.passwordHash = await hashPassword(password);
      updateUser(editing.id, patch);
      toast.success("تم تحديث المستخدم");
    } else {
      addUser({
        name: name.trim(),
        username: username.trim(),
        passwordHash: await hashPassword(password),
        role: "employee",
        permissions,
        ...employeeFields,
      });
      toast.success("تم إضافة المستخدم");
    }
    setSaving(false);
    onClose();
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editing ? "تعديل مستخدم" : "إضافة مستخدم جديد"}
      width="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>إلغاء</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "جاري الحفظ..." : "حفظ"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم الموظف" required error={errors.name}>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: أحمد محمد"
            />
          </Field>
          <Field label="اسم الدخول" required error={errors.username}>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={editing?.role === "owner"}
            />
          </Field>
          <Field label={editing ? "كلمة المرور (اتركه فارغاً لعدم التغيير)" : "كلمة المرور"} required={!editing} error={errors.password}>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
        </div>

        {editing?.role !== "owner" && (
          <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="الراتب الشهري" error={errors.monthlySalary}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={monthlySalary}
                  onChange={(e) => setMonthlySalary(e.target.value)}
                  placeholder="جنيه"
                />
              </Field>
              <Field label="نسبة العمولة على المبيعات" error={errors.salesCommissionPct}>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={salesCommissionPct}
                  onChange={(e) => setSalesCommissionPct(e.target.value)}
                  placeholder="%"
                />
              </Field>
              <Field label="التارجت الشهري" error={errors.monthlySalesTarget}>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={monthlySalesTarget}
                  onChange={(e) => setMonthlySalesTarget(e.target.value)}
                  placeholder="جنيه"
                />
              </Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-800 flex items-center gap-2">
                <Shield className="w-5 h-5 text-brand-600" /> الصلاحيات
              </h3>
              <label className="inline-flex items-center gap-2 rounded-lg border border-brand-200 bg-white px-3 py-2 text-sm font-medium text-brand-700">
                <input
                  type="checkbox"
                  checked={allPermissionsSelected}
                  onChange={(e) => setPermissions(createPermissions(e.target.checked))}
                />
                اختيار الكل
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PERMISSION_GROUPS.map((group) => {
                const groupSelected = areAllPermissionsEnabled(permissions, group.key);
                const groupPermissions = permissions[group.key] as Record<string, boolean>;

                return (
                  <div key={group.key} className="space-y-3 bg-white p-3 rounded-lg border border-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm text-slate-800">{group.label}</div>
                        <div className="text-[11px] text-slate-500 mt-0.5">{group.description}</div>
                      </div>
                      <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={groupSelected}
                          onChange={(e) =>
                            setPermissions((current) =>
                              setPermissionGroup(current, group.key, e.target.checked)
                            )
                          }
                        />
                        كل القسم
                      </label>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {group.actions.map((action) => (
                        <label key={action.key} className="flex items-center gap-2 text-slate-700">
                          <input
                            type="checkbox"
                            checked={Boolean(groupPermissions[action.key])}
                            onChange={(e) =>
                              setPermissions((current) =>
                                setPermission(current, group.key, action.key, e.target.checked)
                              )
                            }
                          />
                          {action.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function UsersPage() {
  const { users, deleteUser } = useUsers();
  const [formState, setFormState] = useState<{ open: boolean; editing?: AppUser }>({ open: false });
  const [delUserId, setDelUserId] = useState<string | null>(null);
  const toast = useToast();

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" /> مستخدمي النظام
          </h1>
          <p className="text-slate-500 mt-1">إدارة الموظفين والصلاحيات الخاصة بهم</p>
        </div>
        <Button onClick={() => setFormState({ open: true })} className="gap-2">
          <Plus className="w-5 h-5" /> إضافة مستخدم
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm text-right">
          <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">الاسم</th>
              <th className="px-4 py-3 font-medium">اسم الدخول</th>
              <th className="px-4 py-3 font-medium">الدور</th>
              <th className="px-4 py-3 font-medium w-32">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-900">{user.name || user.username}</td>
                <td className="px-4 py-3 font-medium text-slate-900">{user.username}</td>
                <td className="px-4 py-3 text-slate-600">
                  {user.role === "owner" ? (
                    <span className="inline-flex items-center gap-1 bg-brand-100 text-brand-700 px-2 py-1 rounded-md text-xs font-semibold">
                      <Shield className="w-3 h-3" /> مدير النظام
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 px-2 py-1 rounded-md text-xs font-medium">
                      موظف
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setFormState({ open: true, editing: user })}
                      className="h-8 px-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    {user.role !== "owner" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDelUserId(user.id)}
                        className="h-8 px-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {formState.open && (
        <UserFormDialog
          open={formState.open}
          onClose={() => setFormState({ open: false })}
          editing={formState.editing}
        />
      )}

      <ConfirmDialog
        open={delUserId !== null}
        onClose={() => setDelUserId(null)}
        onConfirm={() => {
          if (delUserId && deleteUser(delUserId)) {
            toast.success("تم حذف المستخدم");
          }
          setDelUserId(null);
        }}
        title="حذف المستخدم"
        message="هل أنت متأكد من حذف هذا المستخدم نهائياً؟"
        variant="danger"
        confirmText="حذف"
      />
    </div>
  );
}
