import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, rmdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Wallet } from "ethers";
import { saveEvidenceFunding, saveVerifiedRecovery, unlockEvidenceKeystore } from "../scripts/evidenceKeystore";

describe("Evidence signer recovery before funding", function () {
  this.timeout(120_000);
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), "preflight-recovery-test-"));
  });
  afterEach(() => {
    for (const name of ["signer.json", "funding.json"]) {
      const file = path.join(directory, name);
      if (existsSync(file)) rmSync(file);
    }
    rmdirSync(directory);
  });

  it("restores the same signer from disk without storing a plaintext key, and refuses overwrite", async () => {
    const wallet = Wallet.createRandom(); // Unfunded, disposable test key.
    const file = path.join(directory, "signer.json");
    const pass = "test-only-password-no-real-funds";
    const state = await saveVerifiedRecovery(wallet, pass, file);
    const original = readFileSync(file, "utf8");
    assert.ok(!original.includes(wallet.privateKey.slice(2)));
    const restored = await Wallet.fromEncryptedJson(JSON.parse(original).encryptedWallet, pass);
    assert.equal(restored.address, wallet.address);
    await assert.rejects(() => Wallet.fromEncryptedJson(state.encryptedWallet, "incorrect"));
    let attempts = 0;
    const notices: string[] = [];
    const retried = await unlockEvidenceKeystore(
      state.encryptedWallet,
      async () => (++attempts === 1 ? "incorrect" : pass),
      message => notices.push(message),
    );
    assert.equal(retried.address, wallet.address);
    assert.equal(attempts, 2);
    assert.equal(notices.length, 1);
    assert.ok(!notices[0].includes(pass), "Unlock errors must never echo the password");
    await assert.rejects(() => saveVerifiedRecovery(wallet, pass, file), /EEXIST/);
    assert.equal(readFileSync(file, "utf8"), original);
    const metadata = path.join(directory, "funding.json");
    saveEvidenceFunding(state, "0x" + "a".repeat(64), metadata);
    saveEvidenceFunding(state, "0x" + "a".repeat(64), metadata);
    assert.throws(() => saveEvidenceFunding(state, "0x" + "b".repeat(64), metadata));
    assert.equal(readFileSync(file, "utf8"), original, "Funding metadata must never rewrite the key backup");
  });

  it("does not create a recovery file when encryption cannot be verified", async () => {
    const file = path.join(directory, "signer.json");
    await assert.rejects(() =>
      saveVerifiedRecovery(
        { address: Wallet.createRandom().address, encrypt: async () => "invalid JSON" },
        "test-only-password",
        file,
      ),
    );
    assert.equal(existsSync(file), false);
  });
});
