import { sqliteTable, text, integer, primaryKey } from "drizzle-orm/sqlite-core";
import type { InferSelectModel, InferInsertModel } from "drizzle-orm";

// ── Auth ──────────────────────────────────────────────────────────────────

export const roles = sqliteTable("roles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  isSystem: integer("is_system", { mode: "boolean" }).notNull().default(false),
});

export const permissions = sqliteTable("permissions", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    roleId: text("role_id")
      .notNull()
      .references(() => roles.id),
    permissionKey: text("permission_key")
      .notNull()
      .references(() => permissions.key),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })]
);

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  roleId: text("role_id")
    .notNull()
    .references(() => roles.id),
  pinHash: text("pin_hash").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ── Customers & Vehicles ──────────────────────────────────────────────────

export const customers = sqliteTable("customers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  phone: text("phone"),
  createdAt: text("created_at").notNull(),
});

export const vehicles = sqliteTable("vehicles", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").references(() => customers.id),
  brand: text("brand").notNull(),
  model: text("model"),
  plate: text("plate"),
  createdAt: text("created_at").notNull(),
});

// ── Services ──────────────────────────────────────────────────────────────

export const services = sqliteTable("services", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  category: text("category", { enum: ["wash", "chemical", "extra"] }).notNull(),
  hasCommission: integer("has_commission", { mode: "boolean" }).notNull().default(false),
  defaultPrice: integer("default_price"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
});

// ── Discount Codes ────────────────────────────────────────────────────────

export const discountCodes = sqliteTable("discount_codes", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(),
  type: text("type", { enum: ["fixed_amount", "percent", "override"] }).notNull(),
  value: integer("value").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

// ── Orders & Items ────────────────────────────────────────────────────────

export const orders = sqliteTable("orders", {
  id: text("id").primaryKey(),
  ticketNumber: integer("ticket_number").notNull(),
  businessDate: text("business_date").notNull(),
  customerId: text("customer_id").references(() => customers.id),
  vehicleId: text("vehicle_id").references(() => vehicles.id),
  customerName: text("customer_name").notNull(),
  phone: text("phone"),
  vehicleBrand: text("vehicle_brand"),
  keyReceived: integer("key_received", { mode: "boolean" }).notNull().default(false),
  requestedPickupAt: text("requested_pickup_at"),
  note: text("note"),
  queuePosition: integer("queue_position").notNull().default(0),
  status: text("status", {
    enum: ["waiting", "in_progress", "done", "delivered", "cancelled"],
  })
    .notNull()
    .default("waiting"),
  discountCodeId: text("discount_code_id").references(() => discountCodes.id),
  discountAmount: integer("discount_amount").notNull().default(0),
  subtotal: integer("subtotal").notNull().default(0),
  total: integer("total").notNull().default(0),
  commissionInTotal: integer("commission_in_total", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
  finalizedAt: text("finalized_at"),
});

export const orderItems = sqliteTable("order_items", {
  id: text("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id),
  itemType: text("item_type", { enum: ["service", "product"] }).notNull(),
  serviceId: text("service_id").references(() => services.id),
  productId: text("product_id"), // FK → products.id (defined below; no circular ref)
  description: text("description").notNull(),
  unitPrice: integer("unit_price").notNull(),
  qty: integer("qty").notNull().default(1),
  lineTotal: integer("line_total").notNull(),
  performedBy: text("performed_by"), // FK → workers.id (defined below)
  commissionAmount: integer("commission_amount"),
  createdAt: text("created_at").notNull(),
});

export const ticketCounters = sqliteTable("ticket_counters", {
  businessDate: text("business_date").primaryKey(),
  lastNumber: integer("last_number").notNull().default(0),
});

// ── Subscriptions & packages (اشتراكات وباقات) ──────────────────────────────

export const washPackages = sqliteTable("wash_packages", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: ["count", "period"] }).notNull().default("count"),
  price: integer("price").notNull().default(0), // piastres
  washCount: integer("wash_count"), // for "count" packages
  durationDays: integer("duration_days"), // for "period" packages
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  notes: text("notes"),
  createdAt: text("created_at").notNull(),
});

export const customerSubscriptions = sqliteTable("customer_subscriptions", {
  id: text("id").primaryKey(),
  customerId: text("customer_id").notNull(),
  packageId: text("package_id").references(() => washPackages.id),
  packageName: text("package_name").notNull(),
  kind: text("kind", { enum: ["count", "period"] }).notNull().default("count"),
  pricePaid: integer("price_paid").notNull().default(0), // piastres
  totalWashes: integer("total_washes"),
  remainingWashes: integer("remaining_washes"),
  startDate: text("start_date"),
  endDate: text("end_date"),
  status: text("status", { enum: ["active", "used_up", "expired", "cancelled"] })
    .notNull()
    .default("active"),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

export const subscriptionRedemptions = sqliteTable("subscription_redemptions", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id")
    .notNull()
    .references(() => customerSubscriptions.id),
  orderId: text("order_id"), // KV invoice id this wash was redeemed on
  customerId: text("customer_id"),
  washesUsed: integer("washes_used").notNull().default(1),
  businessDate: text("business_date").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Cashier shifts / drawer reconciliation (وردية وجرد الخزنة) ───────────────

export const cashShifts = sqliteTable("cash_shifts", {
  id: text("id").primaryKey(),
  businessDate: text("business_date").notNull(),
  openedAt: text("opened_at").notNull(),
  openedBy: text("opened_by"),
  openingFloat: integer("opening_float").notNull().default(0), // piastres
  closedAt: text("closed_at"),
  closedBy: text("closed_by"),
  countedCash: integer("counted_cash"), // piastres
  expectedCash: integer("expected_cash"), // piastres
  variance: integer("variance"), // piastres (counted − expected)
  status: text("status", { enum: ["open", "closed"] }).notNull().default("open"),
  note: text("note"),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdAt: text("created_at").notNull(),
});

// ── Cloud sync (Phase 9) — outbox + cursor state ─────────────────────────────
// Note: per-entity `updated_at`/`deleted_at` columns and change-capture triggers
// are added by SQL migrations (0008/0009) and read by the engine via raw SQL;
// they are intentionally not mirrored on every Drizzle table to avoid churn,
// since no Drizzle query references them in Phase 1.

export const syncOutbox = sqliteTable("sync_outbox", {
  id: text("id").primaryKey(),
  entity: text("entity").notNull(),
  rowId: text("row_id").notNull(),
  op: text("op", { enum: ["upsert", "delete"] }).notNull(),
  payload: text("payload").notNull(),
  updatedAt: text("updated_at").notNull(),
  deviceId: text("device_id"),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdAt: text("created_at").notNull(),
  syncedAt: text("synced_at"),
});

export const syncState = sqliteTable("sync_state", {
  key: text("key").primaryKey(),
  value: text("value"),
});

// ── Worker attendance (حضور وانصراف الصنايعية) ───────────────────────────────

export const workerAttendance = sqliteTable("worker_attendance", {
  id: text("id").primaryKey(),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id),
  businessDate: text("business_date").notNull(),
  checkIn: text("check_in").notNull(),
  checkOut: text("check_out"),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdAt: text("created_at").notNull(),
});

// ── Workers ───────────────────────────────────────────────────────────────

export const workers = sqliteTable("workers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  wageType: text("wage_type", {
    enum: ["daily_fixed", "monthly", "commission_only"],
  })
    .notNull()
    .default("daily_fixed"),
  baseWage: integer("base_wage"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const workerWithdrawals = sqliteTable("worker_withdrawals", {
  id: text("id").primaryKey(),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id),
  amount: integer("amount").notNull(),
  reason: text("reason"),
  businessDate: text("business_date").notNull(),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

export const dailyClosures = sqliteTable("daily_closures", {
  id: text("id").primaryKey(),
  businessDate: text("business_date").notNull(),
  workerId: text("worker_id")
    .notNull()
    .references(() => workers.id),
  branchId: text("branch_id").notNull().default("branch-main"),
  carsCount: integer("cars_count").notNull().default(0),
  commissionTotal: integer("commission_total").notNull().default(0),
  baseAmount: integer("base_amount").notNull().default(0),
  withdrawalsTotal: integer("withdrawals_total").notNull().default(0),
  netDue: integer("net_due").notNull().default(0),
  closedBy: text("closed_by"),
  closedAt: text("closed_at").notNull(),
});

// ── Treasury ──────────────────────────────────────────────────────────────

export const treasuryEntries = sqliteTable("treasury_entries", {
  id: text("id").primaryKey(),
  businessDate: text("business_date").notNull(),
  type: text("type", { enum: ["expense", "withdrawal", "adjustment"] }).notNull(),
  amount: integer("amount").notNull(),
  description: text("description").notNull(),
  workerId: text("worker_id").references(() => workers.id),
  branchId: text("branch_id").notNull().default("branch-main"),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

// ── Products ──────────────────────────────────────────────────────────────

export const products = sqliteTable("products", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  salePrice: integer("sale_price").notNull(),
  purchasePrice: integer("purchase_price").notNull().default(0),
  stockQty: integer("stock_qty").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const productMovements = sqliteTable("product_movements", {
  id: text("id").primaryKey(),
  productId: text("product_id")
    .notNull()
    .references(() => products.id),
  type: text("type", { enum: ["purchase", "sale", "adjustment"] }).notNull(),
  qty: integer("qty").notNull(),
  unitPrice: integer("unit_price").notNull().default(0),
  orderId: text("order_id").references(() => orders.id),
  branchId: text("branch_id").notNull().default("branch-main"),
  businessDate: text("business_date").notNull(),
  createdBy: text("created_by"),
  createdAt: text("created_at").notNull(),
});

// ── Raw Materials ─────────────────────────────────────────────────────────

export const rawMaterials = sqliteTable("raw_materials", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  unit: text("unit").notNull().default("piece"),
  unitCost: integer("unit_cost").notNull().default(0),
  stockQty: integer("stock_qty").notNull().default(0),
  lowStockThreshold: integer("low_stock_threshold").notNull().default(5),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
});

export const materialMovements = sqliteTable("material_movements", {
  id: text("id").primaryKey(),
  materialId: text("material_id")
    .notNull()
    .references(() => rawMaterials.id),
  type: text("type", { enum: ["purchase", "consumption", "adjustment"] }).notNull(),
  qty: integer("qty").notNull(),
  unitCost: integer("unit_cost").notNull().default(0),
  byWorkerId: text("by_worker_id").references(() => workers.id),
  byUserId: text("by_user_id"),
  branchId: text("branch_id").notNull().default("branch-main"),
  businessDate: text("business_date").notNull(),
  createdAt: text("created_at").notNull(),
});

// ── Car Brands (custom additions to the bundled static list) ──────────────

export const carBrands = sqliteTable("car_brands", {
  id: text("id").primaryKey(),
  nameAr: text("name_ar").notNull(),
  nameEn: text("name_en").notNull(),
  logoImage: text("logo_image"),
  createdAt: text("created_at").notNull(),
});

// ── Settings ──────────────────────────────────────────────────────────────

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

// ── Branches (Phase 9 foundation) ──────────────────────────────────────────

export const branches = sqliteTable("branches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
});

// ── Inferred types (used throughout the renderer) ─────────────────────────

export type Role = InferSelectModel<typeof roles>;
export type Permission = InferSelectModel<typeof permissions>;
export type User = InferSelectModel<typeof users>;
export type Customer = InferSelectModel<typeof customers>;
export type Vehicle = InferSelectModel<typeof vehicles>;
export type Service = InferSelectModel<typeof services>;
export type NewService = InferInsertModel<typeof services>;
export type DiscountCode = InferSelectModel<typeof discountCodes>;
export type Order = InferSelectModel<typeof orders>;
export type NewOrder = InferInsertModel<typeof orders>;
export type OrderItem = InferSelectModel<typeof orderItems>;
export type NewOrderItem = InferInsertModel<typeof orderItems>;
export type Worker = InferSelectModel<typeof workers>;
export type NewWorker = InferInsertModel<typeof workers>;
export type WorkerWithdrawal = InferSelectModel<typeof workerWithdrawals>;
export type DailyClosure = InferSelectModel<typeof dailyClosures>;
export type TreasuryEntry = InferSelectModel<typeof treasuryEntries>;
export type Product = InferSelectModel<typeof products>;
export type ProductMovement = InferSelectModel<typeof productMovements>;
export type RawMaterial = InferSelectModel<typeof rawMaterials>;
export type MaterialMovement = InferSelectModel<typeof materialMovements>;
export type CarBrandRow = InferSelectModel<typeof carBrands>;
export type Setting = InferSelectModel<typeof settings>;
export type Branch = InferSelectModel<typeof branches>;
export type NewBranch = InferInsertModel<typeof branches>;
export type WashPackage = InferSelectModel<typeof washPackages>;
export type NewWashPackage = InferInsertModel<typeof washPackages>;
export type CustomerSubscription = InferSelectModel<typeof customerSubscriptions>;
export type NewCustomerSubscription = InferInsertModel<typeof customerSubscriptions>;
export type SubscriptionRedemption = InferSelectModel<typeof subscriptionRedemptions>;
export type CashShift = InferSelectModel<typeof cashShifts>;
export type WorkerAttendance = InferSelectModel<typeof workerAttendance>;
export type SyncOutbox = InferSelectModel<typeof syncOutbox>;
export type SyncState = InferSelectModel<typeof syncState>;
