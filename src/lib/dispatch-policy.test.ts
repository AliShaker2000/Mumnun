import { describe, expect, it } from "vitest";
import { OFFER_SECONDS, DISPATCH_RADII_KM, offerSecondsLeft } from "./dispatch-policy";

describe("one-minute driver offers", () => {
  it("lasts exactly 60 seconds", () => {
    expect(OFFER_SECONDS).toBe(60);
    expect(offerSecondsLeft(new Date(60000).toISOString(), 0)).toBe(60);
    expect(offerSecondsLeft(new Date(60000).toISOString(), 60000)).toBe(0);
  });
  it("does not restart the deadline on reopen", () => {
    expect(offerSecondsLeft(new Date(60000).toISOString(), 45000)).toBe(15);
  });
  it("expands to farther drivers in three stages", () => {
    expect([...DISPATCH_RADII_KM]).toEqual([2, 5, 10]);
  });
});
