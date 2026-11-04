import { describe, it, expect } from "vitest";
import { governorateOf, isInGovernorate, governorateBounds } from "./governorates";

describe("governorateOf", () => {
  it("places Karrada in Baghdad", () => expect(governorateOf({ lat: 33.3032, lng: 44.4218 }).key).toBe("baghdad"));
  it("places Basra city in Basra", () => expect(governorateOf({ lat: 30.51, lng: 47.8 }).key).toBe("basra"));
  it("allows Najaf places when Najaf is selected", () => {
    expect(isInGovernorate({ lat: 32.0259, lng: 44.3462 }, "najaf")).toBe(true);
  });
  it("excludes Karbala and Baghdad from Najaf search", () => {
    expect(isInGovernorate({ lat: 32.616, lng: 44.0249 }, "najaf")).toBe(false);
    expect(isInGovernorate({ lat: 33.3152, lng: 44.3661 }, "najaf")).toBe(false);
  });
  it("includes rural Najaf rather than guessing the nearest city", () => {
    expect(isInGovernorate({ lat: 31.8, lng: 43.8 }, "najaf")).toBe(true);
  });
  it("uses Najaf administrative search bounds", () => {
    const b = governorateBounds("najaf");
    expect(b.low.latitude).toBeLessThan(32.0259);
    expect(b.high.latitude).toBeGreaterThan(32.0259);
    expect(b.low.longitude).toBeLessThan(44.3462);
    expect(b.high.longitude).toBeGreaterThan(44.3462);
  });
});
