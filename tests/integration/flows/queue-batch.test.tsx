// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "../../../src/store/AppContext";
import { useCarwash } from "../../../src/store/CarwashContext";
import { lsClearAll } from "../../../src/lib/storage";

const wrapper = ({ children }: { children: ReactNode }) => <AppProvider>{children}</AppProvider>;

beforeEach(() => {
  localStorage.clear();
  lsClearAll();
});

afterEach(() => cleanup());

describe("queue batch intake", () => {
  it("creates and persists a distinct ticket for every selected vehicle", () => {
    const { result } = renderHook(() => useCarwash(), { wrapper });
    let created = result.current.queueTickets;

    act(() => {
      created = result.current.addQueueTickets([
        {
          customerId: "customer-1",
          customerName: "عميل اختبار",
          vehicleId: "vehicle-1",
          vehicleBrand: "Toyota",
          vehicleLabel: "Toyota Corolla - أ ب ج 1234",
          arrivalTime: "2026-07-08T10:00:00.000Z",
        },
        {
          customerId: "customer-1",
          customerName: "عميل اختبار",
          vehicleId: "vehicle-2",
          vehicleBrand: "Kia",
          vehicleLabel: "Kia Sportage - د هـ و 5678",
          arrivalTime: "2026-07-08T10:00:00.000Z",
        },
      ]);
    });

    expect(created).toHaveLength(2);
    expect(new Set(created.map((ticket) => ticket.id)).size).toBe(2);
    expect(new Set(created.map((ticket) => ticket.number)).size).toBe(2);
    expect(result.current.queueTickets).toHaveLength(2);
    expect(result.current.queueTickets.map((ticket) => ticket.vehicleId).sort()).toEqual([
      "vehicle-1",
      "vehicle-2",
    ]);
  });
});
