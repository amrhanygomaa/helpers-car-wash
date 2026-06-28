import { describe, expect, it } from "vitest";
import {
  egpToPiastres,
  formatPiastres,
  multiplyUnitPrice,
  piastresToEgp,
} from "../../../src/lib/money";

describe("money utilities", () => {
  it("converts EGP amounts to integer piastres", () => {
    expect(egpToPiastres(12.34)).toBe(1234);
    expect(egpToPiastres("150.5")).toBe(15050);
  });

  it("converts piastres back to EGP", () => {
    expect(piastresToEgp(1234)).toBe(12.34);
  });

  it("formats piastres with EGP by default", () => {
    expect(formatPiastres(123456)).toContain("EGP");
  });

  it("multiplies line totals in piastres without floating point drift", () => {
    expect(multiplyUnitPrice(333, 3)).toBe(999);
  });
});
