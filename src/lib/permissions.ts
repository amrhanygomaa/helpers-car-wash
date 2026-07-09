import type { AppUser, UserPermissions } from "../types";

export type PermissionModule = keyof UserPermissions;
export type PermissionKey =
  | "queue.manage"
  | "invoice.create"
  | "invoice.finalize"
  | "pricing.override"
  | "products.view"
  | "products.manage"
  | "materials.view"
  | "materials.manage"
  | "treasury.manage"
  | "payroll.manage"
  | "reports.view"
  | "customers.view"
  | "workers.manage"
  | "settings.manage"
  | "users.manage";

export const PERMISSION_KEYS: { key: PermissionKey; label: string }[] = [
  { key: "queue.manage", label: "إدارة الدور" },
  { key: "invoice.create", label: "إنشاء فاتورة" },
  { key: "invoice.finalize", label: "تأكيد الفاتورة" },
  { key: "pricing.override", label: "تعديل الأسعار" },
  { key: "products.view", label: "عرض إضافات الغسيل" },
  { key: "products.manage", label: "إدارة إضافات الغسيل" },
  { key: "materials.view", label: "عرض خامات المغسلة" },
  { key: "materials.manage", label: "إدارة خامات المغسلة" },
  { key: "treasury.manage", label: "إدارة الخزينة" },
  { key: "payroll.manage", label: "إدارة الرواتب" },
  { key: "reports.view", label: "عرض التقارير" },
  { key: "customers.view", label: "عرض العملاء" },
  { key: "workers.manage", label: "إدارة الصنايعية" },
  { key: "settings.manage", label: "إدارة الإعدادات" },
  { key: "users.manage", label: "إدارة المستخدمين" },
];

const permissionKeyMap: Record<PermissionKey, { module: PermissionModule; actions: string[] }> = {
  "queue.manage": { module: "queue", actions: ["view", "add", "edit", "cancel"] },
  "invoice.create": { module: "salesInvoices", actions: ["view", "add"] },
  "invoice.finalize": { module: "salesInvoices", actions: ["view", "receive"] },
  "pricing.override": { module: "pricing", actions: ["override"] },
  "products.view": { module: "products", actions: ["view"] },
  "products.manage": { module: "products", actions: ["view", "add", "edit", "delete"] },
  "materials.view": { module: "inventory", actions: ["view"] },
  "materials.manage": { module: "inventory", actions: ["view", "adjust"] },
  "treasury.manage": { module: "cashbox", actions: ["view", "add", "spend", "editOpeningBalance"] },
  "payroll.manage": { module: "payroll", actions: ["view", "manage"] },
  "reports.view": { module: "reports", actions: ["view"] },
  "customers.view": { module: "customers", actions: ["view"] },
  "workers.manage": { module: "workers", actions: ["view", "manage"] },
  "settings.manage": { module: "settings", actions: ["view", "manage"] },
  "users.manage": { module: "users", actions: ["view", "manage"] },
};

export const PERMISSION_GROUPS: {
  key: PermissionModule;
  label: string;
  description: string;
  actions: { key: string; label: string }[];
}[] = [
  {
    key: "products",
    label: "إضافات الغسيل",
    description: "فوّاحات ومعطرات وأي إضافة تُباع مع الغسيل",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "inventory",
    label: "خامات المغسلة",
    description: "رصيد الخامات والاستهلاك اليومي",
    actions: [
      { key: "view", label: "عرض" },
      { key: "adjust", label: "تعديل الكميات" },
    ],
  },
  {
    key: "purchaseInvoices",
    label: "وحدة قديمة غير مستخدمة",
    description: "مقفولة في نسخة إدارة مغسلة السيارات",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "pay", label: "سداد" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "salesInvoices",
    label: "الفواتير",
    description: "الفواتير والتحصيل والإلغاء",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "receive", label: "تحصيل" },
      { key: "cancel", label: "إلغاء" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "customers",
    label: "العملاء",
    description: "بيانات العملاء وأرصدتهم",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "suppliers",
    label: "وحدة قديمة غير مستخدمة",
    description: "مقفولة في نسخة إدارة مغسلة السيارات",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
      { key: "commissions", label: "البونص" },
    ],
  },
  {
    key: "drivers",
    label: "وحدة قديمة غير مستخدمة",
    description: "مقفولة في نسخة إدارة مغسلة السيارات",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "returns",
    label: "وحدة قديمة غير مستخدمة",
    description: "مقفولة في نسخة إدارة مغسلة السيارات",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
    ],
  },
  {
    key: "alerts",
    label: "تنبيهات الغسيل",
    description: "تنبيهات التحصيل والكميات المهمة",
    actions: [{ key: "view", label: "عرض" }],
  },
  {
    key: "cashbox",
    label: "الخزينة",
    description: "الرصيد والحركات اليدوية",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة نقدية" },
      { key: "spend", label: "صرف نقدي" },
      { key: "editOpeningBalance", label: "تعديل افتتاحي" },
    ],
  },
  {
    key: "reports",
    label: "التقارير",
    description: "تقارير الأداء والأرصدة",
    actions: [{ key: "view", label: "عرض" }],
  },
  {
    key: "vehicles",
    label: "المركبات",
    description: "مركبات العملاء وبياناتها",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "washServices",
    label: "خدمات الغسيل",
    description: "خدمات الغسيل وأسعارها وخاماتها",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "delete", label: "حذف" },
    ],
  },
  {
    key: "queue",
    label: "طابور الغسيل",
    description: "استقبال السيارات وإدارة الطابور والمفاتيح",
    actions: [
      { key: "view", label: "عرض" },
      { key: "add", label: "إضافة" },
      { key: "edit", label: "تعديل" },
      { key: "cancel", label: "إلغاء" },
    ],
  },
  {
    key: "pricing",
    label: "التسعير",
    description: "تعديل الأسعار والخصومات اليدوية",
    actions: [{ key: "override", label: "تعديل الأسعار" }],
  },
  {
    key: "payroll",
    label: "الرواتب",
    description: "أجور الصنايعية والعمولات وتقفيل اليوم",
    actions: [
      { key: "view", label: "عرض" },
      { key: "manage", label: "إدارة" },
    ],
  },
  {
    key: "workers",
    label: "الصنايعية",
    description: "بيانات الصنايعية ومن قام بكل خدمة",
    actions: [
      { key: "view", label: "عرض" },
      { key: "manage", label: "إدارة" },
    ],
  },
  {
    key: "settings",
    label: "الإعدادات",
    description: "إعدادات النشاط والطباعة والنسخ الاحتياطي",
    actions: [
      { key: "view", label: "عرض" },
      { key: "manage", label: "إدارة" },
    ],
  },
  {
    key: "users",
    label: "المستخدمون والأدوار",
    description: "إنشاء المستخدمين وتعديل الأدوار والصلاحيات",
    actions: [
      { key: "view", label: "عرض" },
      { key: "manage", label: "إدارة" },
    ],
  },
];

const TOP_GEAR_HIDDEN_PERMISSION_MODULES = new Set<PermissionModule>([
  "purchaseInvoices",
  "suppliers",
  "drivers",
  "returns",
  "alerts",
]);

export const CARWASH_PERMISSION_GROUPS = PERMISSION_GROUPS.filter(
  (group) => !TOP_GEAR_HIDDEN_PERMISSION_MODULES.has(group.key)
);

export function createPermissions(enabled = false): UserPermissions {
  return {
    products: { view: enabled, add: enabled, edit: enabled, delete: enabled },
    inventory: { view: enabled, adjust: enabled },
    purchaseInvoices: { view: enabled, add: enabled, edit: enabled, pay: enabled, delete: enabled },
    salesInvoices: { view: enabled, add: enabled, edit: enabled, receive: enabled, cancel: enabled, delete: enabled },
    customers: { view: enabled, add: enabled, edit: enabled, delete: enabled },
    suppliers: { view: enabled, add: enabled, edit: enabled, delete: enabled, commissions: enabled },
    drivers: { view: enabled, add: enabled, edit: enabled, delete: enabled },
    returns: { view: enabled, add: enabled },
    alerts: { view: enabled },
    cashbox: { view: enabled, add: enabled, spend: enabled, editOpeningBalance: enabled },
    reports: { view: enabled },
    vehicles: { view: enabled, add: enabled, edit: enabled, delete: enabled },
    washServices: { view: enabled, add: enabled, edit: enabled, delete: enabled },
    queue: { view: enabled, add: enabled, edit: enabled, cancel: enabled },
    pricing: { override: enabled },
    payroll: { view: enabled, manage: enabled },
    workers: { view: enabled, manage: enabled },
    settings: { view: enabled, manage: enabled },
    users: { view: enabled, manage: enabled },
  };
}

export function createCashierPermissions(): UserPermissions {
  let permissions = createPermissions(false);
  permissions = setPermissionKey(permissions, "queue.manage", true);
  permissions = setPermissionKey(permissions, "invoice.create", true);
  permissions = setPermissionKey(permissions, "invoice.finalize", true);
  return permissions;
}

export function setCarwashPermissionGroups(
  permissions: UserPermissions,
  value: boolean
): UserPermissions {
  return CARWASH_PERMISSION_GROUPS.reduce(
    (next, group) => setPermissionGroup(next, group.key, value),
    normalizePermissions(permissions)
  );
}

export function areAllCarwashPermissionsEnabled(permissions: UserPermissions) {
  const normalized = normalizePermissions(permissions);
  return CARWASH_PERMISSION_GROUPS.every((group) =>
    group.actions.every((action) =>
      Boolean((normalized[group.key] as Record<string, boolean>)[action.key])
    )
  );
}

export function normalizePermissions(input?: Partial<UserPermissions> | null): UserPermissions {
  const permissions = createPermissions(false);
  const source = (input ?? {}) as Record<string, Record<string, boolean> | undefined>;

  for (const group of PERMISSION_GROUPS) {
    const groupSource = source[group.key];
    for (const action of group.actions) {
      const value = groupSource?.[action.key];
      if (typeof value === "boolean") {
        (permissions[group.key] as Record<string, boolean>)[action.key] = value;
      }
    }
  }

  const legacyProducts = source.products;
  const legacyPurchases = source.purchaseInvoices;
  const legacySales = source.salesInvoices;
  const legacyCustomers = source.customers;
  const legacySuppliers = source.suppliers;
  const legacyCashbox = source.cashbox;

  if (!source.inventory) {
    permissions.inventory.view = Boolean(legacyProducts?.view);
    permissions.inventory.adjust = Boolean(legacyProducts?.edit);
  }
  if (!source.alerts) {
    permissions.alerts.view = Boolean(legacyProducts?.view);
  }
  if (!source.drivers) {
    permissions.drivers.view = Boolean(legacySales?.view);
    permissions.drivers.add = Boolean(legacySales?.add);
    permissions.drivers.edit = Boolean(legacySales?.add);
    permissions.drivers.delete = Boolean(legacySales?.add);
  }
  if (!source.returns) {
    permissions.returns.view = Boolean(legacySales?.view || legacyPurchases?.view);
    permissions.returns.add = Boolean(legacySales?.add || legacyPurchases?.add);
  }
  if (legacyPurchases && typeof legacyPurchases.edit !== "boolean") {
    permissions.purchaseInvoices.edit = false;
  }
  if (legacyPurchases && typeof legacyPurchases.pay !== "boolean") {
    permissions.purchaseInvoices.pay = Boolean(legacyPurchases.add);
  }
  if (legacyPurchases && typeof legacyPurchases.delete !== "boolean") {
    permissions.purchaseInvoices.delete = Boolean(legacyPurchases.add);
  }
  if (legacySales && typeof legacySales.edit !== "boolean") {
    permissions.salesInvoices.edit = false;
  }
  if (legacySales && typeof legacySales.receive !== "boolean") {
    permissions.salesInvoices.receive = Boolean(legacySales.add);
  }
  if (legacySales && typeof legacySales.cancel !== "boolean") {
    permissions.salesInvoices.cancel = Boolean(legacySales.add);
  }
  if (legacySales && typeof legacySales.delete !== "boolean") {
    permissions.salesInvoices.delete = Boolean(legacySales.add);
  }
  if (legacyCustomers && typeof legacyCustomers.delete !== "boolean") {
    permissions.customers.delete = Boolean(legacyCustomers.edit);
  }
  if (legacySuppliers && typeof legacySuppliers.delete !== "boolean") {
    permissions.suppliers.delete = Boolean(legacySuppliers.edit);
  }
  if (legacySuppliers && typeof legacySuppliers.commissions !== "boolean") {
    permissions.suppliers.commissions = Boolean(legacySuppliers.edit);
  }
  if (legacyCashbox && typeof legacyCashbox.add !== "boolean") {
    permissions.cashbox.add = Boolean(legacyCashbox.view);
  }
  if (legacyCashbox && typeof legacyCashbox.spend !== "boolean") {
    permissions.cashbox.spend = Boolean(legacyCashbox.view);
  }
  if (legacyCashbox && typeof legacyCashbox.editOpeningBalance !== "boolean") {
    permissions.cashbox.editOpeningBalance = Boolean(legacyCashbox.view);
  }

  for (const group of PERMISSION_GROUPS) {
    const nextGroup = permissions[group.key] as Record<string, boolean>;
    const hasViewAction = group.actions.some((action) => action.key === "view");
    const hasAction = group.actions.some((action) => action.key !== "view" && nextGroup[action.key]);
    if (hasViewAction && hasAction) nextGroup.view = true;
    if (hasViewAction && !nextGroup.view) {
      group.actions.forEach((action) => {
        if (action.key !== "view") nextGroup[action.key] = false;
      });
    }
  }

  return permissions;
}

export function normalizeUser(user: AppUser): AppUser {
  const cleanUsername = String(user.username || "").trim();
  const cleanName = String(user.name || cleanUsername).trim();
  const role = user.role === "owner" || user.role === "cashier" ? user.role : "employee";

  return {
    ...user,
    role,
    roleId: user.roleId ?? (role === "owner" || role === "cashier" ? role : "custom"),
    name: cleanName || cleanUsername,
    permissions: normalizePermissions(user.permissions),
  };
}

export function hasPermission(
  user: AppUser | null | undefined,
  module: PermissionModule,
  action = "view"
) {
  if (!user) return false;
  if (user.role === "owner") return true;
  const permissions = normalizePermissions(user.permissions);
  return Boolean((permissions[module] as Record<string, boolean> | undefined)?.[action]);
}

export function hasPermissionKey(user: AppUser | null | undefined, key: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  const mapping = permissionKeyMap[key];
  const permissions = normalizePermissions(user.permissions);
  const group = permissions[mapping.module] as Record<string, boolean>;
  return mapping.actions.every((action) => Boolean(group[action]));
}

export function setPermissionKey(
  permissions: UserPermissions,
  key: PermissionKey,
  value: boolean
): UserPermissions {
  const mapping = permissionKeyMap[key];
  let next = normalizePermissions(permissions);
  for (const action of mapping.actions) {
    next = setPermission(next, mapping.module, action, value);
  }
  return normalizePermissions(next);
}

export function enabledPermissionKeys(permissions: UserPermissions): PermissionKey[] {
  return PERMISSION_KEYS
    .filter(({ key }) => {
      const mapping = permissionKeyMap[key];
      const normalized = normalizePermissions(permissions);
      const group = normalized[mapping.module] as Record<string, boolean>;
      return mapping.actions.every((action) => Boolean(group[action]));
    })
    .map(({ key }) => key);
}

export function setPermission(
  permissions: UserPermissions,
  module: PermissionModule,
  action: string,
  value: boolean
): UserPermissions {
  const normalized = normalizePermissions(permissions);
  const group = PERMISSION_GROUPS.find((item) => item.key === module);
  const nextGroup = {
    ...normalized[module],
    [action]: value,
  } as Record<string, boolean>;

  if (action !== "view" && value) {
    const hasViewAction = group?.actions.some((item) => item.key === "view");
    if (hasViewAction) nextGroup.view = true;
  }
  if (action === "view" && !value && group) {
    group.actions.forEach((item) => {
      if (item.key !== "view") nextGroup[item.key] = false;
    });
  }

  return {
    ...normalized,
    [module]: nextGroup,
  };
}

export function setPermissionGroup(
  permissions: UserPermissions,
  module: PermissionModule,
  value: boolean
): UserPermissions {
  const normalized = normalizePermissions(permissions);
  const group = PERMISSION_GROUPS.find((item) => item.key === module);
  if (!group) return normalized;
  const nextGroup = { ...normalized[module] } as Record<string, boolean>;
  group.actions.forEach((action) => {
    nextGroup[action.key] = value;
  });
  return {
    ...normalized,
    [module]: nextGroup,
  };
}

export function areAllPermissionsEnabled(
  permissions: UserPermissions,
  module?: PermissionModule
) {
  const normalized = normalizePermissions(permissions);
  const groups = module
    ? PERMISSION_GROUPS.filter((group) => group.key === module)
    : PERMISSION_GROUPS;

  return groups.every((group) =>
    group.actions.every((action) => Boolean((normalized[group.key] as Record<string, boolean>)[action.key]))
  );
}
