# 🛠️ Missing Features — Warehouse System
**Repo:** `https://github.com/amrhanygomaa/Inv_system.git`
**Stack:** React + TypeScript + Tailwind + LocalStorage (AppContext)
**Date:** 2026-05-12

---

## Overview

The current build covers the core product/invoice/cashbox flow. The following 5 features are missing and must be implemented on top of the existing codebase without breaking current functionality.

---

## Feature 1 — Sequential Product Codes (Starting from 1000)

### Current Behaviour
`ProductForm.tsx` line 58 generates codes like:
```ts
code: `P-${Math.floor(1000 + Math.random() * 9000)}`
```
This produces random non-sequential codes like `P-4823`, `P-1190`, etc.

### Required Behaviour
- Codes must be **sequential integers** starting from `1000`
- Format: `1000`, `1001`, `1002`, … (no prefix)
- Auto-generated on product creation — **user cannot edit the code field**
- Code persists permanently and is never reused, even if the product is deleted

### Implementation Notes
- Add a `nextProductCode: number` field to `AppState` (default `1000`), persisted in localStorage
- On `addProduct()` in `AppContext.tsx`: use current `nextProductCode` as the code, then increment and save
- In `ProductForm.tsx`: make the code field **read-only** (display only, no `onChange`)
- Seed data in `seed.ts` should use codes `1000`, `1001`, `1002`, etc.

---

## Feature 2 — Multi-User Roles & Permissions

### Current Behaviour
Single login with hardcoded `"admin"` username. No user management. No permissions model.

### Required Behaviour

**User Roles:**

| Role | Permissions |
|---|---|
| `owner` | Full access — manages users, sees everything, can add/remove permissions |
| `employee` | Configurable per-user — owner picks which modules they can access |

**Modules that can be toggled per employee:**
- Products (view / add / edit / delete)
- Purchase Invoices (view / add)
- Sales Invoices (view / add)
- Customers (view / add / edit)
- Suppliers (view / add / edit)
- Cashbox (view only)
- Reports (view only)

**Login Page:**
- Username + Password fields (no email needed)
- Passwords stored hashed (use `btoa` at minimum or `crypto.subtle` SHA-256)

### New Types to Add (`types/index.ts`)
```ts
export type UserRole = "owner" | "employee";

export interface UserPermissions {
  products: { view: boolean; add: boolean; edit: boolean; delete: boolean };
  purchaseInvoices: { view: boolean; add: boolean };
  salesInvoices: { view: boolean; add: boolean };
  customers: { view: boolean; add: boolean; edit: boolean };
  suppliers: { view: boolean; add: boolean; edit: boolean };
  cashbox: { view: boolean };
  reports: { view: boolean };
}

export interface AppUser {
  id: ID;
  username: string;
  passwordHash: string;
  role: UserRole;
  permissions: UserPermissions;
  createdAt: string;
}
```

### Implementation Notes
- Add `users: AppUser[]` and `currentUser: AppUser | null` to `AppState`
- Owner account is seeded on first run (username: `admin`, password: `admin123`) — owner can change password from Settings
- Add a **Users Management page** (visible to owner only):
  - List all users
  - Add new user (username + password + permissions checkboxes)
  - Edit user permissions
  - Delete user
- Sidebar links must hide based on `currentUser.permissions`
- If an employee tries to access a restricted route, redirect to `/` with a toast "ليس لديك صلاحية"

---

## Feature 3 — Return Invoices (مرتجعات)

### Current Behaviour
No returns functionality exists. `StockMovementType` already has `"return"` defined but it's unused.

### Required Behaviour

**Sales Returns (مرتجع بيع):**
- User opens an existing Sales Invoice → clicks "إنشاء مرتجع"
- Selects which lines to return and the quantity per line
- System creates a `SalesReturn` record linked to the original invoice
- Stock is **increased** by returned quantities
- Customer's balance is **decreased** (or a credit note is issued)
- Cash is optionally refunded (if original was cash)

**Purchase Returns (مرتجع توريد):**
- User opens an existing Purchase Invoice → clicks "إنشاء مرتجع"
- Selects which lines to return and quantities
- System creates a `PurchaseReturn` record linked to original invoice
- Stock is **decreased** by returned quantities
- Supplier balance is **decreased**

### New Types to Add (`types/index.ts`)
```ts
export interface ReturnLine {
  id: ID;
  productId: ID;
  productName: string;
  unit: string;
  quantity: number;
  price: number;
  subtotal: number;
}

export interface SalesReturn {
  id: ID;
  returnNumber: string;
  date: string;
  originalInvoiceId: ID;
  originalInvoiceNumber: string;
  customerId: ID;
  customerName: string;
  lines: ReturnLine[];
  total: number;
  refundCash: boolean;
  notes?: string;
  createdAt: string;
}

export interface PurchaseReturn {
  id: ID;
  returnNumber: string;
  date: string;
  originalInvoiceId: ID;
  originalInvoiceNumber: string;
  supplierId: ID;
  supplierName: string;
  lines: ReturnLine[];
  total: number;
  notes?: string;
  createdAt: string;
}
```

### New Actions to Add (`AppContext.tsx`)
```ts
addSalesReturn: (r: Omit<SalesReturn, "id" | "createdAt" | "returnNumber">) => SalesReturn;
addPurchaseReturn: (r: Omit<PurchaseReturn, "id" | "createdAt" | "returnNumber">) => PurchaseReturn;
```

### New Pages
- `/returns` — Lists all returns (sales + purchase) with tabs
- Return number format: `SR-0001` for sales returns, `PR-0001` for purchase returns

### UI Entry Points
- `SalesInvoiceDetailPage.tsx` → add "إنشاء مرتجع بيع" button (disabled if invoice is cancelled)
- `PurchaseInvoiceDetailPage.tsx` → add "إنشاء مرتجع توريد" button

---

## Feature 4 — Driver Management

### Current Behaviour
`driverName` in `SalesInvoice` is a plain free-text `<Input>` field. No managed list of drivers.

### Required Behaviour
- A dedicated **Drivers list** managed in settings or a sub-page
- When creating a Sales Invoice, driver is selected from a **dropdown** (not typed)
- User can still add a new driver inline from the dropdown (quick-add)

### New Type to Add (`types/index.ts`)
```ts
export interface Driver {
  id: ID;
  name: string;
  phone?: string;
  notes?: string;
  createdAt: string;
}
```

### Implementation Notes
- Add `drivers: Driver[]` to `AppState`
- Add actions: `addDriver`, `updateDriver`, `deleteDriver`
- `SalesInvoice` keeps `driverName: string` as-is for display, but also add `driverId?: ID`
- Add a **Drivers tab** inside the existing `SuppliersPage` or `SettingsPage` (owner choice)
- In `SalesInvoiceNewPage.tsx`: replace the text input with a searchable `<select>` or combobox showing driver names; include a "+ سائق جديد" option that opens a quick-add dialog

---

## Feature 5 — Supplier Commission / Bonus Tracking

### Current Behaviour
`Supplier.commissionNote` is a plain text string — no calculation, no thresholds, no tracking.

### Required Behaviour
- Each supplier can have **one or more commission tiers**
- A tier defines: "if total purchased from this supplier reaches X EGP in a period → earn Y% bonus (or fixed amount)"
- The system calculates the current bonus earned based on actual `PurchaseInvoice` totals per supplier
- Display on the Supplier detail view: "مشتريات الفترة الحالية: X جنيه — بونص مستحق: Y جنيه"

### New Types to Add (`types/index.ts`)
```ts
export type CommissionType = "percentage" | "fixed";

export interface CommissionTier {
  id: ID;
  threshold: number;       // minimum purchase amount to qualify
  commissionType: CommissionType;
  commissionValue: number; // percentage (0–100) or fixed EGP amount
  periodDays: number;      // rolling window in days (e.g. 30 = last 30 days)
}

// Add to Supplier interface:
// commissionTiers?: CommissionTier[];
```

### Implementation Notes
- Replace `commissionNote: string` in `Supplier` with `commissionTiers?: CommissionTier[]`
  - Keep `commissionNote` as an optional free-text field alongside the tiers
- Add a `supplierCommission(supplierId: ID): number` computed function in `AppContext` (similar to existing `supplierBalance`)
- In `SuppliersPage.tsx` supplier detail drawer: add a **"العمولات"** section with:
  - Table of tiers (threshold / type / value / period)
  - Add / edit / delete tier buttons (owner only)
  - A calculated summary card: "إجمالي المشتريات في الـ N يوم الماضية: X جنيه → العمولة المستحقة: Y جنيه"

---

## Acceptance Checklist

- [ ] Product codes are sequential from 1000, read-only, never reused
- [ ] Owner can create employees with granular permissions; sidebar hides restricted links
- [ ] Sales return flow: select lines → confirm → stock up, balance down
- [ ] Purchase return flow: select lines → confirm → stock down, supplier balance down
- [ ] Returns appear in Reports page totals (as negative sales / negative purchases)
- [ ] Driver dropdown in Sales Invoice new page with quick-add
- [ ] Supplier commission tiers: add/edit/delete tiers, computed bonus displayed on supplier detail
- [ ] All new localStorage keys follow existing naming convention in `storage.ts`
- [ ] All new pages are registered in `App.tsx` router
- [ ] Arabic RTL labels on all new UI elements (consistent with existing style)
- [ ] No TypeScript errors (`tsc --noEmit` passes)

---

## Notes for Developer

- **Do not** change the existing `lsGet` / `lsSet` storage helpers — extend them
- **Do not** introduce any external backend or new npm packages unless absolutely necessary
- UI style: follow existing Tailwind token system in `tailwind.config.js` and existing component patterns in `src/components/ui/`
- Test with the existing seed data (`src/data/seed.ts`) — seed data must still load without errors after changes