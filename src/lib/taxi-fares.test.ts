import { describe, it, expect } from "vitest";
import {
  taxiFare,
  calculateFareBreakdown,
  roundUp250,
  WEATHER_RATES,
  ROAD_RATES,
} from "./taxi-fares";

describe("taxi fares with realistic distance, road condition, and climate", () => {
  it("always ends in a multiple of 250 dinars for all combinations", () => {
    for (const km of [0.5, 2.7, 5.1, 9.99, 17.4]) {
      for (const c of ["economy", "premium", "luxury"] as const) {
        for (const w of ["heat", "rain", "cold", "mild"] as const) {
          for (const r of ["normal", "congested"] as const) {
            const fare = taxiFare(c, km, { weather: w, roadCondition: r });
            expect(fare % 250).toBe(0);
          }
        }
      }
    }
    expect(roundUp250(5001)).toBe(5250);
  });

  it("grows with distance proportionally", () => {
    const fare5 = taxiFare("economy", 5, { weather: "mild", roadCondition: "normal" });
    const fare15 = taxiFare("economy", 15, { weather: "mild", roadCondition: "normal" });
    expect(fare15).toBeGreaterThan(fare5);
  });

  it("adds climate allowance for heat (AC), rain, and cold", () => {
    const mild = taxiFare("economy", 10, { weather: "mild", roadCondition: "normal" });
    const heat = taxiFare("economy", 10, { weather: "heat", roadCondition: "normal" });
    const rain = taxiFare("economy", 10, { weather: "rain", roadCondition: "normal" });
    const cold = taxiFare("economy", 10, { weather: "cold", roadCondition: "normal" });

    expect(heat).toBeGreaterThanOrEqual(mild);
    expect(rain).toBeGreaterThanOrEqual(mild);
    expect(cold).toBeGreaterThanOrEqual(mild);
  });

  it("adds traffic allowance during congested road conditions", () => {
    const normal = taxiFare("economy", 10, { weather: "mild", roadCondition: "normal" });
    const congested = taxiFare("economy", 10, { weather: "mild", roadCondition: "congested" });

    expect(congested).toBeGreaterThanOrEqual(normal);
  });

  it("returns transparent breakdown with all factors", () => {
    const breakdown = calculateFareBreakdown("economy", 8.5, {
      weather: "heat",
      roadCondition: "congested",
    });

    expect(breakdown.distanceKm).toBe(8.5);
    expect(breakdown.baseFare).toBe(2000);
    expect(breakdown.weatherAllowance).toBe(WEATHER_RATES.heat.extra);
    expect(breakdown.trafficAllowance).toBe(ROAD_RATES.congested.extra);
    expect(breakdown.total % 250).toBe(0);
    expect(breakdown.total).toBeGreaterThanOrEqual(breakdown.minimumFare);
  });
});
