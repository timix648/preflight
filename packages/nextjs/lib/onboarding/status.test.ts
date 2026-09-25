import { explain, explainedCodes } from "./status";
import { describe, expect, it } from "vitest";

describe("real Error objects preserve their actionable status", () => {
  it.each(explainedCodes().filter(code => code !== "UNKNOWN"))("explains Error(%s), not its generic name", code => {
    expect(explain(new Error(code))).toEqual(explain(code));
  });
  it("finds the status inside RPC error prose", () => {
    expect(explain(new Error("execution reverted: TOKEN_NOT_ASSOCIATED_TO_ACCOUNT"))).toMatchObject({
      code: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
    });
  });
  it("still handles an unknown failure without throwing", () => {
    expect(explain(new Error("not a recognised status"))).toMatchObject({ code: "UNKNOWN" });
  });
});
