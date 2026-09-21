#!/usr/bin/env node
/**
 * Local eligibility-gate rehearsal.
 *
 * Runs the same assertions as .harness/validators/static.json, with one
 * deliberate difference: the "forbidden" list is checked against files git
 * actually TRACKS, not against the working tree.
 *
 * That difference is the point. Gate item G8 is about committed secrets. A
 * local packages/hardhat/.env is not a gate failure — it is required to
 * deploy anything. A committed one is fatal and unfixable by deletion,
 * because git keeps history. The harness validator checks the working tree,
 * which is right for a clean-machine rehearsal and wrong for a dev checkout;
 * this script is the dev-checkout counterpart.
 *
 *   node scripts/gate-check.mjs
 */
import fs from "node:fs";
import { execSync } from "node:child_process";

const validator = JSON.parse(
  fs.readFileSync(".harness/validators/static.json", "utf8"),
);

let pass = 0;
const failures = [];
const check = (condition, message) => {
  if (condition) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${message}`);
  } else {
    failures.push(message);
    console.log(`  \x1b[31mFAIL\x1b[0m  ${message}`);
  }
};

const tracked = new Set(
  execSync("git ls-files", { encoding: "utf8" }).split("\n").filter(Boolean),
);

console.log("\nRequired files");
for (const file of validator.fileAssertions.required) {
  check(fs.existsSync(file), file);
}

console.log("\nForbidden files — must not be COMMITTED");
for (const file of validator.fileAssertions.forbidden) {
  const onDisk = fs.existsSync(file);
  const isTracked = tracked.has(file);
  check(
    !isTracked,
    `${file} not committed${onDisk && !isTracked ? "  (present locally, correctly ignored)" : ""}`,
  );
}

console.log("\nREADME and AGENTS content");
for (const assertion of validator.textAssertions) {
  const body = fs.existsSync(assertion.file)
    ? fs.readFileSync(assertion.file, "utf8")
    : "";
  for (const needle of assertion.contains) {
    check(body.includes(needle), `${assertion.file} contains "${needle}"`);
  }
}

console.log("\nSecret scan across tracked files");
const pattern = new RegExp(validator.secretScan.patterns[0].pattern);
const hits = [...tracked].filter((file) => {
  try {
    return pattern.test(fs.readFileSync(file, "utf8"));
  } catch {
    return false;
  }
});
check(
  hits.length === 0,
  `no key-shaped assignment across ${tracked.size} tracked files` +
    (hits.length ? ` -> ${hits.join(", ")}` : ""),
);

console.log(`\n${pass} passed, ${failures.length} failed`);
if (failures.length) {
  console.log("\nOutstanding:");
  for (const f of failures) console.log(`  - ${f}`);
  console.log(
    '\nNote: README needing "hashscan.io" is expected until the first\n' +
      "testnet transaction lands. It is a deliberate nag, not a defect.\n",
  );
  process.exit(1);
}
console.log("");
