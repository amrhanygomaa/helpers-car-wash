import { describe, it, expect } from "vitest";
import { lineWorkers, splitCommissionEvenly } from "../../../src/store/_pure";
import type { InvoiceLine, SalesInvoice } from "../../../src/types";

describe("splitCommissionEvenly", () => {
  it("returns [] for zero workers", () => {
    expect(splitCommissionEvenly(100, 0)).toEqual([]);
  });

  it("gives the whole amount to a single worker", () => {
    expect(splitCommissionEvenly(75, 1)).toEqual([75]);
  });

  it("splits evenly when divisible", () => {
    expect(splitCommissionEvenly(100, 4)).toEqual([25, 25, 25, 25]);
  });

  it("puts the rounding remainder on the earliest shares and always sums to total", () => {
    const parts = splitCommissionEvenly(100, 3); // 33.34 + 33.33 + 33.33
    expect(parts).toEqual([33.34, 33.33, 33.33]);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
  });

  it("handles piastre-level remainders", () => {
    const parts = splitCommissionEvenly(10, 3); // 3.34 + 3.33 + 3.33
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10, 2);
  });
});

describe("lineWorkers", () => {
  it("prefers the multi-worker list when present", () => {
    const line = {
      workers: [
        { workerId: "w1", commissionAmount: 10 },
        { workerId: "w2", commissionAmount: 5 },
      ],
      employeeId: "legacy",
      commissionAmount: 99,
    };
    expect(lineWorkers(line)).toHaveLength(2);
    expect(lineWorkers(line)[0].workerId).toBe("w1");
  });

  it("falls back to the legacy single employee", () => {
    const line = { employeeId: "w1", employeeName: "أحمد", commissionAmount: 12 };
    expect(lineWorkers(line)).toEqual([{ workerId: "w1", workerName: "أحمد", commissionAmount: 12 }]);
  });

  it("returns [] for an unmanned line", () => {
    expect(lineWorkers({})).toEqual([]);
  });
});


