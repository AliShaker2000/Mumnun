import { describe, it, expect } from "vitest";
import { taxiFare, calculateFareBreakdown } from "./taxi-fares";

describe("400 IQD per actual driving kilometer", () => {
  it.each(["economy", "premium", "luxury"] as const)("charges 4000 IQD for 10 km in %s", (category) => {
    expect(taxiFare(category, 10)).toBe(4000);
  });
  it("has no minimum or base fare", () => {
    expect(taxiFare("economy", 1)).toBe(400);
    expect(taxiFare("economy", 0.5)).toBe(200);
  });
  it("does not round up to 250 IQD", () => {
    expect(taxiFare("economy", 8.501)).toBe(3400.4);
  });
  it("adds no traffic or weather surcharges", () => {
    const fare = calculateFareBreakdown("luxury", 5, { weather: "heat", roadCondition: "congested" });
    expect(fare.total).toBe(2000);
    expect(fare.weatherAllowance).toBe(0);
    expect(fare.trafficAllowance).toBe(0);
  });
  it("rejects unavailable distances", () => {
    expect(() => taxiFare("economy", NaN)).toThrow();
  });
});
