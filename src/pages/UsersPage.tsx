import { useState } from "react";
import { Users, Plus, Shield, Trash2, Edit } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Button } from "../components/ui/Button";
import { Dialog } from "../components/ui/Dialog";
import { Field, Input } from "../components/ui/Input";
import { useToast } from "../components/ui/Toast";
import type { AppUser, UserPermissions } from "../types";

const DEFAULT_PERMISSIONS: UserPermissions = {
  products: { view: false, add: false, edit: false, delete: false },
  purchaseInvoices: { view: false, add: false },
  salesInvoices: { view: false, add: false },
  customers: { view: false, add: false, edit: false },
  suppliers: { view: false, add: false, edit: false },
  cashbox: { view: false },
  reports: { view: false },
};

function UserFormDialog({
  open,
  onClose,
  editing,
}: {
  open: boolean;
  onClose: () => void;
  editing?: AppUser | null;
}) {
  const { addUser, updateUser } = useApp();
  const toast = useToast();

  const [username, setUsername] = useState(editing?.username || "");
  const [password, setPassword] = useState("");
  const [permissions, setPermissions] = useState<UserPermissions>(
    editing?.permissions || DEFAULT_PERMISSIONS
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  function handleSave() {
    const e: Record<string, string> = {};
    if (!username.trim()) e.username = "مطلوب";
    if (!editing && !password) e.password = "مطلوب";
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }

    if (editing) {
      const patch: Partial<AppUser> = { username: username.trim(), permissions };
      if (password) patch.passwordHash = btoa(password);
      updateUser(editing.id, patch);
      toast.success("تم تحديث المستخدم");
    } else {
      addUser({
        username: username.trim(),
        passwordHash: btoa(password),
        role: "employee",
        permissions,
      });
      toast.success("تم إضافة المستخدم");
    }
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
          <Button onClick={handleSave}>حفظ</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="اسم المستخدم" required error={errors.username}>
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
            <h3 className="font-semibold text-slate-800 flex items-center gap-2 mb-2">
              <Shield className="w-5 h-5 text-brand-600" /> الصلاحيات
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Products */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">المنتجات</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.products.view} onChange={(e) => setPermissions(p => ({...p, products: {...p.products, view: e.target.checked}}))} /> عرض</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.products.add} onChange={(e) => setPermissions(p => ({...p, products: {...p.products, add: e.target.checked}}))} /> إضافة</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.products.edit} onChange={(e) => setPermissions(p => ({...p, products: {...p.products, edit: e.target.checked}}))} /> تعديل</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.products.delete} onChange={(e) => setPermissions(p => ({...p, products: {...p.products, delete: e.target.checked}}))} /> حذف</label>
                </div>
              </div>

              {/* Purchase Invoices */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">مشتريات</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.purchaseInvoices.view} onChange={(e) => setPermissions(p => ({...p, purchaseInvoices: {...p.purchaseInvoices, view: e.target.checked}}))} /> عرض</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.purchaseInvoices.add} onChange={(e) => setPermissions(p => ({...p, purchaseInvoices: {...p.purchaseInvoices, add: e.target.checked}}))} /> إضافة</label>
                </div>
              </div>

              {/* Sales Invoices */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">مبيعات</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.salesInvoices.view} onChange={(e) => setPermissions(p => ({...p, salesInvoices: {...p.salesInvoices, view: e.target.checked}}))} /> عرض</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.salesInvoices.add} onChange={(e) => setPermissions(p => ({...p, salesInvoices: {...p.salesInvoices, add: e.target.checked}}))} /> إضافة</label>
                </div>
              </div>

              {/* Customers */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">عملاء</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.customers.view} onChange={(e) => setPermissions(p => ({...p, customers: {...p.customers, view: e.target.checked}}))} /> عرض</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.customers.add} onChange={(e) => setPermissions(p => ({...p, customers: {...p.customers, add: e.target.checked}}))} /> إضافة</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.customers.edit} onChange={(e) => setPermissions(p => ({...p, customers: {...p.customers, edit: e.target.checked}}))} /> تعديل</label>
                </div>
              </div>

              {/* Suppliers */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">موردين</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.suppliers.view} onChange={(e) => setPermissions(p => ({...p, suppliers: {...p.suppliers, view: e.target.checked}}))} /> عرض</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.suppliers.add} onChange={(e) => setPermissions(p => ({...p, suppliers: {...p.suppliers, add: e.target.checked}}))} /> إضافة</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.suppliers.edit} onChange={(e) => setPermissions(p => ({...p, suppliers: {...p.suppliers, edit: e.target.checked}}))} /> تعديل</label>
                </div>
              </div>

              {/* Cashbox & Reports */}
              <div className="space-y-2 bg-white p-3 rounded-lg border border-slate-200">
                <div className="font-medium text-sm text-slate-700">أخرى</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.cashbox.view} onChange={(e) => setPermissions(p => ({...p, cashbox: { view: e.target.checked}}))} /> عرض الخزينة</label>
                  <label className="flex items-center gap-1"><input type="checkbox" checked={permissions.reports.view} onChange={(e) => setPermissions(p => ({...p, reports: { view: e.target.checked}}))} /> التقارير</label>
                </div>
              </div>

            </div>
          </div>
        )}
      </div>
    </Dialog>
  );
}

export function UsersPage() {
  const { users, deleteUser } = useApp();
  const [formState, setFormState] = useState<{ open: boolean; editing?: AppUser }>({ open: false });
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
              <th className="px-4 py-3 font-medium">اسم المستخدم</th>
              <th className="px-4 py-3 font-medium">الدور</th>
              <th className="px-4 py-3 font-medium w-32">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-slate-50 transition-colors">
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
                        onClick={() => {
                          if (confirm("تأكيد الحذف؟")) {
                            if (deleteUser(user.id)) {
                              toast.success("تم حذف المستخدم");
                            }
                          }
                        }}
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
    </div>
  );
}
