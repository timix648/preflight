/** Test harness recovery, using ethers' standard encrypted JSON keystore. */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import password from "@inquirer/password";
import { Wallet } from "ethers";
import { ROOT } from "./evidenceSupport";

export const evidenceKeystorePath = path.join(ROOT, ".harness/runtime/evidence-signer.json");
const fundingPath = path.join(ROOT, ".harness/runtime/evidence-funding.json");

export async function unlockEvidenceKeystore(
  encryptedWallet: string,
  ask: () => Promise<string> = () => password({ message: "Unlock the evidence recovery keystore:" }),
  notice: (message: string) => void = console.log,
) {
  while (true) {
    const pass = await ask();
    try {
      return await Wallet.fromEncryptedJson(encryptedWallet, pass);
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("incorrect password")) throw error;
      // Stay inside a masked prompt. Exiting immediately can cause the next
      // password attempt to be typed into (and recorded by) the ordinary shell.
      notice("Password did not match. Try at the next unlock prompt, or press Ctrl+C to stop.");
    }
  }
}

export async function saveVerifiedRecovery(
  wallet: { address: string; encrypt: (password: string) => Promise<string> },
  pass: string,
  destination = evidenceKeystorePath,
) {
  const encryptedWallet = await wallet.encrypt(pass);
  assert.equal((await Wallet.fromEncryptedJson(encryptedWallet, pass)).address, wallet.address);
  const state = { version: 1, address: wallet.address, encryptedWallet, fundingHash: null as string | null };
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, JSON.stringify(state), { flag: "wx", mode: 0o600 });
  assert.equal(
    (await Wallet.fromEncryptedJson(JSON.parse(readFileSync(destination, "utf8")).encryptedWallet, pass)).address,
    wallet.address,
  );
  return state;
}

export async function recoverableEvidenceSigner() {
  if (!process.stdin.isTTY)
    throw new Error(
      "Run --browser in your own terminal to unlock its encrypted recovery file. Never put the password in chat or command arguments.",
    );
  if (existsSync(evidenceKeystorePath)) {
    const state = JSON.parse(readFileSync(evidenceKeystorePath, "utf8"));
    const wallet = await unlockEvidenceKeystore(state.encryptedWallet);
    assert.equal(wallet.address, state.address, "Recovery address mismatch");
    if (existsSync(fundingPath)) {
      const funding = JSON.parse(readFileSync(fundingPath, "utf8"));
      assert.equal(funding.address, wallet.address, "Funding belongs to a different recovery signer");
      state.fundingHash = funding.hash;
    }
    return { wallet, state };
  }
  if (process.argv.includes("--refund") || process.argv.includes("--resume"))
    throw new Error("No saved evidence signer exists. Refund mode never creates or funds an account.");
  if (existsSync(fundingPath))
    throw new Error(
      "Funding metadata exists without its recovery key. Restore the matching backup before continuing; no new funding requested.",
    );
  const pass = await password({ message: "Choose a new evidence recovery password (at least 12 characters):" });
  if (pass.length < 12) throw new Error("Use at least 12 characters for the recovery password.");
  if (pass !== (await password({ message: "Confirm the recovery password:" })))
    throw new Error("Passwords did not match; no funding requested.");
  const wallet = Wallet.createRandom();
  // Refuse to overwrite another session's backup. No plaintext key is persisted.
  const state = await saveVerifiedRecovery(wallet, pass);
  console.log(`Recovery keystore saved and verified: ${evidenceKeystorePath}`);
  return { wallet, state };
}

export function saveEvidenceFunding(
  state: { address: string; fundingHash: string | null },
  hash: string,
  destination = fundingPath,
) {
  // Funding metadata never rewrites the encrypted key backup.
  if (existsSync(destination)) {
    const saved = JSON.parse(readFileSync(destination, "utf8"));
    assert.equal(saved.address, state.address);
    assert.equal(saved.hash, hash);
  } else {
    writeFileSync(destination, JSON.stringify({ address: state.address, hash }), { flag: "wx", mode: 0o600 });
  }
  state.fundingHash = hash;
}
