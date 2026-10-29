import { describe, expect, it } from "bun:test";
import { applyCustomerChanges, type CustomerRow } from "../src/hooks/use-customers";

const row = (id: string, name: string) => ({ id, name }) as unknown as CustomerRow;

describe("applyCustomerChanges (batched realtime updates)", () => {
  it("returns the same page object when no visible row changed", () => {
    const page = { rows: [row("a", "A"), row("b", "B")], total: 10 };
    const out = applyCustomerChanges(page, new Map([["zz", { name: "Z" }]]), new Set(["yy"]));
    expect(out).toBe(page);
  });

  it("patches visible rows and removes deleted rows in one pass", () => {
    const page = { rows: [row("a", "A"), row("b", "B"), row("c", "C")], total: 10 };
    const out = applyCustomerChanges(page, new Map([["a", { name: "A2" }]]), new Set(["b"]));
    expect(out.rows.map((r) => [r.id, r.name])).toEqual([
      ["a", "A2"],
      ["c", "C"],
    ]);
    expect(out.total).toBe(9);
  });

  it("never lets the total go below zero", () => {
    const page = { rows: [row("a", "A")], total: 0 };
    expect(applyCustomerChanges(page, new Map(), new Set(["a"])).total).toBe(0);
  });
});
