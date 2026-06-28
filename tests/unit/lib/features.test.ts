import { describe, it, expect } from "vitest";
import {
  FEATURES,
  FEATURE_MAP,
  isAllowedByLicense,
  defaultFeatureState,
  isFeatureEnabled,
  type FeatureKey,
} from "../../../src/lib/features";
import type { LicensePayload, Settings } from "../../../src/types";

function makeLicense(features?: string[]): LicensePayload {
  return {
    licenseId: "LIC-1",
    machineHash: "HASH",
    subscriptionType: "lifetime",
    subscriptionStartDate: "2026-01-01",
    subscriptionExpiresAt: null,
    warrantyStartDate: null,
    warrantyExpiresAt: null,
    issuedAt: "2026-01-01",
    signature: "sig",
    ...(features !== undefined ? { features } : {}),
  };
}

function settingsWith(features?: Record<string, boolean>): Settings {
  return { features } as unknown as Settings;
}

describe("FEATURE_MAP", () => {
  it("indexes every feature def by its key", () => {
    expect(Object.keys(FEATURE_MAP)).toHaveLength(FEATURES.length);
    for (const f of FEATURES) {
      expect(FEATURE_MAP[f.key]).toBe(f);
    }
  });

  it("keeps stocktakes and dues off by default", () => {
    expect(FEATURE_MAP.stocktakes.defaultEnabled).toBe(false);
    expect(FEATURE_MAP.dues.defaultEnabled).toBe(false);
  });
});

describe("isAllowedByLicense", () => {
  it("allows everything when the license is missing (back-compat)", () => {
    expect(isAllowedByLicense("stocktakes", null)).toBe(true);
    expect(isAllowedByLicense("stocktakes", undefined)).toBe(true);
  });

  it("allows everything when the feature list is empty", () => {
    expect(isAllowedByLicense("stocktakes", makeLicense([]))).toBe(true);
  });

  it("allows only the whitelisted keys when a package is present", () => {
    const lic = makeLicense(["salesInvoices", "products"]);
    expect(isAllowedByLicense("salesInvoices", lic)).toBe(true);
    expect(isAllowedByLicense("products", lic)).toBe(true);
    expect(isAllowedByLicense("stocktakes", lic)).toBe(false);
  });
});

describe("defaultFeatureState", () => {
  it("falls back to the built-in default for unpackaged serials", () => {
    expect(defaultFeatureState("salesInvoices", null)).toBe(true);
    expect(defaultFeatureState("stocktakes", null)).toBe(false);
  });

  it("falls back to the built-in default for an empty package list", () => {
    expect(defaultFeatureState("stocktakes", makeLicense([]))).toBe(false);
  });

  it("is driven by the package list when one is present", () => {
    const lic = makeLicense(["stocktakes"]);
    // In the package => ON even though its built-in default is false.
    expect(defaultFeatureState("stocktakes", lic)).toBe(true);
    // Outside the package => OFF even though its built-in default is true.
    expect(defaultFeatureState("salesInvoices", lic)).toBe(false);
  });
});

describe("isFeatureEnabled", () => {
  it("returns false when the license disallows the module (hard cap)", () => {
    const lic = makeLicense(["salesInvoices"]);
    // Even an explicit owner ON cannot widen past the license cap.
    expect(isFeatureEnabled("stocktakes", settingsWith({ stocktakes: true }), lic)).toBe(false);
  });

  it("honours an explicit owner override when allowed by the license", () => {
    expect(isFeatureEnabled("reports", settingsWith({ reports: false }), null)).toBe(false);
    expect(isFeatureEnabled("stocktakes", settingsWith({ stocktakes: true }), null)).toBe(true);
  });

  it("falls back to the default state when no override is set", () => {
    expect(isFeatureEnabled("salesInvoices", settingsWith({}), null)).toBe(true);
    expect(isFeatureEnabled("stocktakes", settingsWith({}), null)).toBe(false);
    expect(isFeatureEnabled("stocktakes", null, null)).toBe(false);
  });

  it("treats an undefined override as 'not set' (uses default), not as off", () => {
    const settings = settingsWith({ reports: undefined as unknown as boolean });
    expect(isFeatureEnabled("reports", settings, null)).toBe(true);
  });

  it("combines license package and owner hide-toggle", () => {
    const lic = makeLicense(["salesInvoices", "stocktakes"]);
    // Allowed + in package => default ON, owner hides it.
    expect(isFeatureEnabled("stocktakes", settingsWith({ stocktakes: false }), lic)).toBe(false);
    // Allowed + in package + no override => ON.
    expect(isFeatureEnabled("stocktakes", settingsWith({}), lic)).toBe(true);
  });

  it("evaluates every feature key without throwing", () => {
    for (const f of FEATURES) {
      const key: FeatureKey = f.key;
      expect(typeof isFeatureEnabled(key, null, null)).toBe("boolean");
    }
  });
});
