import assert from "node:assert/strict";
import { evidenceEvmFees } from "../scripts/evidenceEvmFees";
import { evidenceError } from "../scripts/evidenceSupport";

describe("Evidence relay fee and error regression", () => {
  it("uses the relay gas price rather than a nominal EIP-1559 base fee", async () => {
    const floor = 1_140_000_000_000n;
    const fee = await evidenceEvmFees({
      send: async (method, params) => {
        assert.equal(method, "eth_gasPrice");
        assert.deepEqual(params, []);
        return `0x${floor.toString(16)}`;
      },
    });
    assert.equal(fee.type, 0);
    assert.ok(fee.gasPrice >= floor);
    assert.equal(fee.gasPrice, 1_254_000_000_000n);
    await assert.rejects(() => evidenceEvmFees({ send: async () => "0x0" }));
  });
  it("keeps the useful RPC reason without copying signed transaction bytes", () => {
    const signed = "0x" + "ab".repeat(200);
    const message = evidenceError({
      shortMessage: "could not coalesce error",
      error: { message: "Gas price below minimum" },
      payload: { params: [signed] },
    });
    assert.match(message, /Gas price below minimum/);
    assert.ok(!message.includes(signed));
    assert.ok(!evidenceError(new Error(`Rejected payload ${signed}`)).includes(signed));
  });
});
