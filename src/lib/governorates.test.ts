import { describe, it, expect } from "vitest";
import { governorateOf } from "./governorates";

describe("governorateOf", () => {
  it("places Karrada in Baghdad", () => expect(governorateOf({ lat: 33.3032, lng: 44.4218 }).key).toBe("baghdad"));
  it("places Basra city in Basra", () => expect(governorateOf({ lat: 30.51, lng: 47.8 }).key).toBe("basra"));
});
