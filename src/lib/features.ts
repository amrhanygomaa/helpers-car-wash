import type { LicensePayload, Settings } from "../types";

/**
 * Optional/gateable modules of the system. Core surfaces (dashboard, settings,
 * users, audit log, import, profile) are intentionally NOT here — they are
 * always available and cannot be turned off.
 *
 * Feature state is resolved in two layers (see {@link isFeatureEnabled}):
 *   1. License cap  — the package the client paid for. Signed into the serial,
 *      so the client cannot widen it. Absent ⇒ everything allowed (old serials).
 *   2. Owner preference — Settings toggles let the owner hide an allowed module
 *      they don't use. Falls back to {@link FeatureDef.defaultEnabled}.
 */
export type FeatureKey =
  | "salesInvoices"
  | "products"
  | "inventory"
  | "stocktakes"
  | "alerts"
  | "customers"
  | "cashbox"
  | "dues"
  | "reports"
  | "carwashQueue"
  | "vehicles"
  | "washServices";

export interface FeatureDef {
  key: FeatureKey;
  label: string;
  description: string;
  /** Effective state when the owner hasn't set an explicit toggle. */
  defaultEnabled: boolean;
}

export const FEATURES: FeatureDef[] = [
  { key: "salesInvoices", label: "فواتير الغسيل", description: "إنشاء وإدارة فواتير الغسيل للعملاء", defaultEnabled: true },
  { key: "customers", label: "العملاء", description: "إدارة بيانات العملاء وكشوف حساباتهم", defaultEnabled: true },
  { key: "cashbox", label: "الخزينة", description: "حركة النقدية والرصيد", defaultEnabled: true },
  { key: "dues", label: "تحصيل العملاء", description: "متابعة تحصيل فواتير الغسيل", defaultEnabled: false },
  { key: "reports", label: "تقارير المغسلة", description: "تقارير المغسلة والتحصيل والأرباح", defaultEnabled: true },
  { key: "carwashQueue", label: "طابور الغسيل", description: "استقبال السيارات وإدارة طابور الغسيل ومفاتيح السيارات", defaultEnabled: true },
  { key: "vehicles", label: "المركبات", description: "إدارة مركبات العملاء (الماركة والموديل واللوحة)", defaultEnabled: true },
  { key: "washServices", label: "خدمات الغسيل", description: "تعريف خدمات الغسيل وأسعارها والخامات المرتبطة بها", defaultEnabled: true },
  { key: "products", label: "إضافات الغسيل", description: "فوّاحات ومعطرات وإضافات تُباع مع الغسيل", defaultEnabled: true },
  { key: "inventory", label: "خامات المغسلة", description: "متابعة رصيد الخامات والاستهلاك", defaultEnabled: true },
  { key: "stocktakes", label: "مراجعة الكميات", description: "مراجعة كميات الإضافات والخامات", defaultEnabled: false },
  { key: "alerts", label: "تنبيهات المخزون", description: "تنبيهات نقص الإضافات والخامات", defaultEnabled: true },
];

export const FEATURE_MAP: Record<FeatureKey, FeatureDef> = FEATURES.reduce(
  (acc, f) => {
    acc[f.key] = f;
    return acc;
  },
  {} as Record<FeatureKey, FeatureDef>
);

/**
 * Car-wash modules are the core of the Top Gear build — they ship with the
 * product, not as a paid add-on. They are exempt from the license whitelist so
 * that licenses issued before these keys existed (warehouse-era serials) still
 * surface them. Owner Settings toggles can still hide them if unwanted.
 */
const LICENSE_EXEMPT_FEATURES: ReadonlySet<FeatureKey> = new Set<FeatureKey>([
  "carwashQueue",
  "vehicles",
  "washServices",
]);

/**
 * License cap. When the serial carries an explicit feature whitelist, only those
 * keys are allowed. An absent/empty list means the license predates feature
 * packaging — allow everything so existing installs keep working. Car-wash
 * modules are always allowed (see {@link LICENSE_EXEMPT_FEATURES}).
 */
export function isAllowedByLicense(key: FeatureKey, license?: LicensePayload | null): boolean {
  if (LICENSE_EXEMPT_FEATURES.has(key)) return true;
  const allowed = license?.features;
  if (!allowed || allowed.length === 0) return true;
  return allowed.includes(key);
}

/**
 * Effective module state before the owner's hide-toggle is applied.
 *
 * - If the serial carries an explicit package (`features` list), that list
 *   *drives* enablement: a module in the package is ON (so a client who paid
 *   for Quotations sees it without extra steps), one outside it is OFF.
 * - Otherwise (old/unpackaged serials) fall back to each module's built-in
 *   default — which is why Quotations/Stocktakes stay hidden until toggled.
 */
export function defaultFeatureState(key: FeatureKey, license?: LicensePayload | null): boolean {
  // Car-wash modules ship with the product — never gated by the license package.
  if (LICENSE_EXEMPT_FEATURES.has(key)) return FEATURE_MAP[key].defaultEnabled;
  const licFeatures = license?.features;
  if (licFeatures && licFeatures.length > 0) return licFeatures.includes(key);
  return FEATURE_MAP[key].defaultEnabled;
}

/**
 * Effective module state = allowed by the license (hard cap) AND enabled by the
 * owner's settings (preference). When the owner hasn't set an explicit toggle it
 * falls back to {@link defaultFeatureState}.
 */
export function isFeatureEnabled(
  key: FeatureKey,
  settings?: Settings | null,
  license?: LicensePayload | null
): boolean {
  if (!isAllowedByLicense(key, license)) return false;
  const override = settings?.features?.[key];
  if (override !== undefined) return override;
  return defaultFeatureState(key, license);
}
