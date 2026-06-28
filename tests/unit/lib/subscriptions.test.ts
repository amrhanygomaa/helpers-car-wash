import { describe, it, expect } from "vitest";
import {
  isSubscriptionUsable,
  subscriptionStatus,
  subscriptionStatusLabel,
  addDaysISO,
} from "../../../src/lib/subscriptions";

const TODAY = "2026-06-28";

describe("isSubscriptionUsable", () => {
  it("count: usable while washes remain", () => {
    expect(isSubscriptionUsable({ kind: "count", remainingWashes: 3 }, TODAY)).toBe(true);
    expect(isSubscriptionUsable({ kind: "count", remainingWashes: 0 }, TODAY)).toBe(false);
  });

  it("period: usable while today is within the window", () => {
    expect(isSubscriptionUsable({ kind: "period", endDate: "2026-07-01" }, TODAY)).toBe(true);
    expect(isSubscriptionUsable({ kind: "period", endDate: "2026-06-27" }, TODAY)).toBe(false);
    expect(isSubscriptionUsable({ kind: "period", endDate: TODAY }, TODAY)).toBe(true); // inclusive
  });

  it("cancelled is never usable", () => {
    expect(isSubscriptionUsable({ kind: "count", remainingWashes: 5, status: "cancelled" }, TODAY)).toBe(false);
  });
});

describe("subscriptionStatus / label", () => {
  it("derives used_up for an exhausted count package", () => {
    expect(subscriptionStatus({ kind: "count", remainingWashes: 0 }, TODAY)).toBe("used_up");
    expect(subscriptionStatusLabel({ kind: "count", remainingWashes: 0 }, TODAY)).toBe("مُستهلك");
  });

  it("derives expired for a lapsed period package", () => {
    expect(subscriptionStatus({ kind: "period", endDate: "2026-06-01" }, TODAY)).toBe("expired");
  });

  it("derives active for a valid package", () => {
    expect(subscriptionStatus({ kind: "count", remainingWashes: 2 }, TODAY)).toBe("active");
    expect(subscriptionStatusLabel({ kind: "period", endDate: "2026-12-31" }, TODAY)).toBe("فعّال");
  });

  it("cancelled overrides everything", () => {
    expect(subscriptionStatus({ kind: "count", remainingWashes: 9, status: "cancelled" }, TODAY)).toBe("cancelled");
  });
});

describe("addDaysISO", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-06-28", 30)).toBe("2026-07-28");
    expect(addDaysISO("2026-12-25", 10)).toBe("2027-01-04");
  });

  it("adds zero days unchanged", () => {
    expect(addDaysISO("2026-06-28", 0)).toBe("2026-06-28");
  });
});
