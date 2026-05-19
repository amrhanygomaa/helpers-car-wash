# Task: Quarterly Cash-Basis Commission for Employees

## Context

This is the **Helpers Inventory System** — a React + TypeScript + Electron desktop app.  
The main state file is `src/store/AppContext.tsx`.  
The report page is `src/pages/EmployeeReportPage.tsx`.

---

## Problem

The current `employeeSalesStats` function calculates employee commission:
- **Monthly** (not quarterly)
- Based on `inv.total` (sale amount, regardless of actual payment received)
- Filtered by `inv.date` (sale date, not payment date)

```ts
// ❌ Current (WRONG) logic in AppContext.tsx
const totalSales = salesInvoices
  .filter(inv =>
    inv.createdByUserId === userId &&
    !inv.cancelled &&
    inv.date.slice(0, 7) === monthKey   // sale date, not payment date
  )
  .reduce((sum, inv) => sum + inv.total, 0); // full invoice total, not collected amount
```

---

## Business Rule

Commission must be calculated every **Quarter (3 months)** based on **cash actually received**, not sale value.

| Sale Type | When was money received? | Commission Quarter |
|---|---|---|
| Cash (وقتي) | Same day as sale | Quarter of sale date |
| Credit (آجل) | Later via `recordSalesReceipt` | Quarter of the actual payment date |
| Credit paid **after** quarter ends | After quarter closed | Goes to the **next** quarter |

> **Key principle**: Commission follows the money, not the invoice.

---

## How Payments Are Already Tracked

Every payment (cash or credit) creates a `CashEntry` record in state:

```ts
interface CashEntry {
  id: ID;
  type: CashEntryType;   // "sales-receipt" ← this is what we need
  amount: number;        // amount actually collected
  referenceId?: ID;      // the SalesInvoice.id this payment belongs to
  date: string;          // actual payment date ✅ (YYYY-MM-DD)
}
```

- For **cash sales**: `CashEntry` is created at invoice time with `date = inv.date`
- For **credit sales**: `CashEntry` is created when `recordSalesReceipt()` is called with `date = today`

---

## Required Changes

### 1. Add helper functions in `src/lib/utils.ts`

```ts
export function getQuarter(dateStr: string): { q: number; year: number } {
  const d = new Date(dateStr);
  return {
    q: Math.floor(d.getMonth() / 3) + 1,
    year: d.getFullYear(),
  };
}

export function quarterBounds(quarter: string): { start: string; end: string } {
  // quarter format: "2025-Q2"
  const [yearStr, qStr] = quarter.split("-Q");
  const year = parseInt(yearStr);
  const q = parseInt(qStr);
  const start = new Date(year, (q - 1) * 3, 1).toISOString().slice(0, 10);
  const end = new Date(year, q * 3, 0).toISOString().slice(0, 10);
  return { start, end };
}

export function dateToQuarterKey(dateStr: string): string {
  const { q, year } = getQuarter(dateStr);
  return `${year}-Q${q}`;
}
```

---

### 2. Update `AppActions` interface in `AppContext.tsx`

Change the signature of `employeeSalesStats`:

```ts
// BEFORE
employeeSalesStats: (userId: ID, month: string) => {
  totalSales: number;
  target: number;
  remaining: number;
  achieved: boolean;
  commissionEarned: number;
  salary: number;
  totalEarnings: number;
};

// AFTER
employeeSalesStats: (userId: ID, quarter: string) => {
  totalCollected: number;
  commissionEarned: number;
  salary: number;
  totalEarnings: number;
  quarterLabel: string;
};
```

---

### 3. Rewrite `employeeSalesStats` in `AppContext.tsx`

Replace the current implementation with:

```ts
const employeeSalesStats: AppActions["employeeSalesStats"] = useCallback(
  (userId, quarter) => {
    const employee = users.find((u) => u.id === userId);

    // Parse quarter — format: "2025-Q2"
    const [yearStr, qStr] = quarter.split("-Q");
    const year = parseInt(yearStr);
    const q = parseInt(qStr);
    const quarterStart = new Date(year, (q - 1) * 3, 1).toISOString().slice(0, 10);
    const quarterEnd = new Date(year, q * 3, 0).toISOString().slice(0, 10);

    // Get all non-cancelled invoices created by this employee
    const empInvoices = salesInvoices.filter(
      (inv) => inv.createdByUserId === userId && !inv.cancelled
    );
    const empInvoiceIds = new Set(empInvoices.map((inv) => inv.id));

    // Sum all cash receipts for this employee's invoices that fall in this quarter
    const totalCollected = cashEntries
      .filter(
        (ce) =>
          ce.type === "sales-receipt" &&
          ce.referenceId &&
          empInvoiceIds.has(ce.referenceId) &&
          ce.date >= quarterStart &&
          ce.date <= quarterEnd
      )
      .reduce((sum, ce) => sum + ce.amount, 0);

    const commissionPct = employee?.salesCommissionPct ?? 0;
    const commissionEarned = (totalCollected * commissionPct) / 100;
    const salary = employee?.monthlySalary ?? 0;

    return {
      totalCollected,
      commissionEarned,
      salary,
      totalEarnings: salary + commissionEarned,
      quarterLabel: `Q${q} ${year}`,
    };
  },
  [users, salesInvoices, cashEntries]  // add cashEntries to deps
);
```

> **Important**: Make sure `cashEntries` is included in the `useCallback` dependency array.

---

### 4. Update `EmployeeReportPage.tsx`

#### 4a. Replace the month state with a quarter state

```ts
// BEFORE
const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));

// AFTER
const [quarter, setQuarter] = useState(() => {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${q}`;
});
```

#### 4b. Replace the month input with a quarter selector

```tsx
// BEFORE
<Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-52" />

// AFTER — build a simple quarter selector
const currentYear = new Date().getFullYear();
const quarterOptions = [];
for (let y = currentYear; y >= currentYear - 2; y--) {
  for (let q = 4; q >= 1; q--) {
    quarterOptions.push(`${y}-Q${q}`);
  }
}

<select
  value={quarter}
  onChange={(e) => setQuarter(e.target.value)}
  className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
>
  {quarterOptions.map((opt) => (
    <option key={opt} value={opt}>{opt.replace("-Q", " — Q")}</option>
  ))}
</select>
```

#### 4c. Update the stats call and displayed values

```tsx
// BEFORE
const stats = employeeSalesStats(employee.id, month);

// AFTER
const stats = employeeSalesStats(employee.id, quarter);
```

Replace all references in the JSX:

| Old field | New field |
|---|---|
| `stats.totalSales` | `stats.totalCollected` |
| `stats.target` | *(remove or keep separately)* |
| `stats.remaining` | *(remove)* |
| `stats.achieved` | *(remove)* |

Update the display rows:

```tsx
<ReportRow
  label="إجمالي التحصيل"
  value={formatCurrency(stats.totalCollected, settings.currency)}
/>
<ReportRow
  label={`العمولة (${employee.salesCommissionPct ?? 0}%)`}
  value={formatCurrency(stats.commissionEarned, settings.currency)}
/>
<ReportRow
  label="الراتب"
  value={formatCurrency(stats.salary, settings.currency)}
/>
<ReportRow
  label="الإجمالي"
  value={formatCurrency(stats.totalEarnings, settings.currency)}
  tone="green"
  strong
/>
```

---

## Edge Cases to Handle

| Case | Expected Behavior |
|---|---|
| Cash sale (وقتي) — CashEntry date = sale date | ✅ Counted in correct quarter automatically |
| Credit sale paid within same quarter | ✅ Counted correctly |
| Credit sale paid after quarter ends | ❌ Not counted in that quarter — goes to next |
| Cancelled invoice (`cancelled: true`) | ❌ Excluded via `empInvoices` filter |
| Employee with `salesCommissionPct = 0` | ✅ Commission = 0, totalCollected still shows |
| Invoice with no `createdByUserId` | ❌ Excluded (not in `empInvoiceIds`) |
| Partial payments across multiple quarters | ✅ Each CashEntry counted in its own quarter by date |

---

## Acceptance Criteria

- [ ] `employeeSalesStats` uses `cashEntries` filtered by `type === "sales-receipt"` and `date` within the quarter
- [ ] Commission is based on `totalCollected` (actual cash received), not `inv.total`
- [ ] The UI shows a Quarter selector (e.g. `2025 — Q2`) instead of a month picker
- [ ] Cancelled invoices are excluded
- [ ] Credit sales paid after the quarter closes are NOT counted in that quarter
- [ ] `cashEntries` is added to the `useCallback` dependency array in `employeeSalesStats`
- [ ] No TypeScript errors after changes
- [ ] The app builds successfully with `npm run build`
