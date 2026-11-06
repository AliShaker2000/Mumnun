import { describe, it, expect } from "vitest";
import { taxiFare, calculateFareBreakdown } from "./taxi-fares";

describe("400 IQD per actual driving kilometer", () => {
  it.each(["economy", "premium", "luxury"] as const)("charges 4000 IQD for 10 km in %s", (category) => {
    expect(taxiFare(category, 10)).toBe(4000);
  });
  it("has no minimum or base fare", () => {
    expect(taxiFare("economy", 1)).toBe(1000);
    expect(taxiFare("economy", 0.5)).toBe(1000);
  });
  it("rounds to the nearest 250 IQD", () => {
    expect(taxiFare("economy", 8.501)).toBe(3500);
    expect(taxiFare("economy", 8.3)).toBe(3250);
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

describe("minimum fare", () => {
  it("never charges less than 1000 IQD", () => {
    expect(taxiFare("economy", 0)).toBe(1000);
  });
});
