import { describe, expect, it } from "vitest";
import { parseDrivingRoute } from "./route-distance";
import { taxiFare } from "./taxi-fares";

describe("confirmed real road distance", () => {
  it("prices the returned driving distance, preserving its precision", () => {
    const route = parseDrivingRoute({ routes: [{ distanceMeters: 8501, duration: "123.5s" }] });
    expect(route.distanceKm).toBe(8.501);
    expect(route.durationMin).toBe(123.5 / 60);
    expect(taxiFare("economy", route.distanceKm, { weather: "mild", roadCondition: "normal" })).toBe(3400.4);
  });
  it("does not invent a fare when there is no route", () => {
    expect(() => parseDrivingRoute({ routes: [] })).toThrow();
  });
  it("rejects incomplete or invalid road-distance responses", () => {
    expect(() => parseDrivingRoute({ routes: [{ distanceMeters: -1, duration: "20s" }] })).toThrow();
    expect(() => parseDrivingRoute({ routes: [{ distanceMeters: 1000 }] })).toThrow();
    expect(() => parseDrivingRoute({ routes: [{ distanceMeters: 1000, duration: "broken" }] })).toThrow();
  });
  it("preserves Google protobuf's valid omitted zero distance", () => {
    expect(parseDrivingRoute({ routes: [{ duration: "0s" }] }).distanceKm).toBe(0);
  });
});