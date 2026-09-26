/** Hashio enforces eth_gasPrice; a tiny block base fee is not a usable fee quote. */
import assert from "node:assert/strict";

export async function evidenceEvmFees(provider: { send: (method: string, params: any[]) => Promise<any> }) {
  const raw = await provider.send("eth_gasPrice", []);
  assert.ok(typeof raw === "string" && /^0x[0-9a-f]+$/i.test(raw), "Relay did not return a valid gas price");
  const quoted = BigInt(raw);
  assert.ok(quoted > 0n, "A positive relay gas price is required");
  // Explicit legacy pricing avoids ethers deriving maxFeePerGas from the
  // nominal block base fee (218 weibar vs a live minimum of 1.14e12).
  return { type: 0 as const, gasPrice: (quoted * 110n + 99n) / 100n };
}
