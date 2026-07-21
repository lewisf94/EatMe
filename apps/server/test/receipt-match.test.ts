import { describe, it, expect } from "vitest";
import { matchLine, type MatchContext } from "../src/services/receipt/match";

const ctx: MatchContext = {
  products: [
    { id: "p1", name: "Chickpeas", brand: "Tesco", norm: "tesco chickpeas" },
    { id: "p2", name: "Passata", brand: "Tesco", norm: "tesco passata" },
    { id: "p3", name: "Olive Oil", brand: null, norm: "olive oil" },
  ],
  aliasMap: new Map([["chckpeas 400g", "p1"]]),
};

describe("matchLine", () => {
  it("a learned alias wins outright", () => {
    const r = matchLine("chckpeas 400g", ctx);
    expect(r.match).toMatchObject({ productId: "p1", via: "alias" });
    expect(r.suggestions).toEqual([]);
  });

  it("an exact normalized name matches", () => {
    const r = matchLine("olive oil", ctx);
    expect(r.match).toMatchObject({ productId: "p3", via: "exact" });
  });

  it("token similarity gives a confident fuzzy match", () => {
    const r = matchLine("tesco passata 500g", ctx);
    expect(r.match).toMatchObject({ productId: "p2", via: "fuzzy" });
  });

  it("no reasonable match → null + (here) no suggestions", () => {
    const r = matchLine("random widget xyz", ctx);
    expect(r.match).toBeNull();
    expect(r.suggestions).toEqual([]);
  });
});
