import { Suspense } from "react";
import { DiagnoseForm } from "./_components/DiagnoseForm";
import type { NextPage } from "next";
import { CopyableValue } from "~~/components/onboarding/CopyableValue";
import { SourceBadge } from "~~/components/onboarding/SourceBadge";
import {
  OnboardingError,
  describeKeySituation,
  describeStrategy,
  explain,
  profileAccount,
  selectStrategy,
  tinybarToHbar,
} from "~~/lib/onboarding";
import { readHbarFromMirror } from "~~/lib/onboarding";

/**
 * Every trap, on one screen, for any account, with no wallet.
 *
 * A Server Component driven by the `account` query parameter. That choice is
 * deliberate: the diagnosis is shareable as a URL, survives a refresh, and
 * needs no client-side fetching or key material.
 */
export const dynamic = "force-dynamic";

/** Accounts that each demonstrate something specific. All live on testnet. */
const SUGGESTIONS = [
  { id: "0.0.2", note: "ED25519, long-zero address, zero automatic slots" },
  { id: "0.0.10608004", note: "ECDSA with a key-derived address and unlimited slots" },
  { id: "0.0.10604882", note: "Threshold key — no single ECRECOVER can speak for it" },
];

const Row = ({
  label,
  value,
  tone = "neutral",
  note,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad";
  note?: string;
}) => (
  <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 py-2 border-b border-base-300 last:border-0">
    <div className="sm:w-56 shrink-0 text-sm opacity-70">{label}</div>
    <div className="grow">
      <div
        className={`font-mono text-sm break-all ${
          tone === "good" ? "text-success" : tone === "bad" ? "text-error" : tone === "warn" ? "text-warning" : ""
        }`}
      >
        {value}
      </div>
      {note ? <div className="text-xs opacity-60 mt-0.5">{note}</div> : null}
    </div>
  </div>
);

const Diagnosis = async ({ account }: { account: string }) => {
  let profile;
  let balance = null;

  try {
    profile = await profileAccount(account);
    balance = await readHbarFromMirror(profile.accountId).catch(() => null);
  } catch (error) {
    const explanation = error instanceof OnboardingError ? error.explanation : explain(error);
    return (
      <div className="alert alert-error flex-col items-start gap-1">
        <div className="font-bold">{explanation.code}</div>
        <div>{explanation.human}</div>
        <div className="text-sm opacity-90">{explanation.fix}</div>
      </div>
    );
  }

  const hasHbar = balance ? (balance.value as bigint) > 0n : false;
  const slots = profile.autoAssociationSlots;

  // What would the kit do if YOU sent this account a new token right now?
  //
  // The framing matters, and getting it wrong produces advice that contradicts
  // the rest of this page. This route inspects an account the viewer almost
  // certainly does NOT control — a counterparty, a user, an address someone
  // pasted. So from the sender's side:
  //
  //   recipientCanSign        false. You cannot make a stranger sign anything.
  //                           Not a claim about the account's key, a claim
  //                           about what YOU can arrange.
  //   recipientHasHbarForFees only meaningful if they could sign at all.
  //   senderControlsRecipient false, by definition of this route.
  //
  // Modelled the other way it recommended a batch — "the recipient can sign
  // and pay" — for an account this same page reports cannot sign EVM
  // transactions at all.
  const selection = selectStrategy({
    alreadyAssociated: false,
    freeAutoSlots: slots,
    recipientCanSign: false,
    recipientHasHbarForFees: hasHbar,
    senderControlsRecipient: false,
    preferSingleApproval: true,
    batchSupported: true,
  });

  const strategy = selection.strategy === "none" ? null : describeStrategy(selection.strategy);

  return (
    <div className="flex flex-col gap-6">
      {/* ---------------- identity and address duality ---------------- */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-base">Identity</h2>
          <Row label="Account id" value={<CopyableValue value={profile.accountId} label="account id" />} />
          <Row label="EVM address" value={<CopyableValue value={profile.evmAddress} label="EVM address" />} />
          <Row
            label="Address form"
            value={profile.addressForm}
            tone={profile.addressForm === "evm-from-key" ? "good" : "warn"}
            note={
              profile.addressForm === "evm-long-zero"
                ? "Derived from the account NUMBER, not from a public key."
                : profile.addressForm === "evm-from-key"
                  ? "Derived from the account's ECDSA public key."
                  : undefined
            }
          />
          <Row
            label="ECRECOVER compatible"
            value={profile.ecrecoverCompatible ? "yes" : "no"}
            tone={profile.ecrecoverCompatible ? "good" : "bad"}
            note={
              profile.ecrecoverCompatible
                ? "A recovered signer address can be compared against this address directly."
                : "ECRECOVER will NOT fail on this account — it will return a different, valid-looking address. Code that compares the two rejects a legitimate signature and cannot explain why. Verify through isAuthorized on the Account Service at 0x16a instead."
            }
          />
        </div>
      </div>

      {/* ---------------- keys ---------------- */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-base">Key</h2>
          <Row label="Key type" value={profile.keyType} tone={profile.keyType === "ECDSA" ? "good" : "warn"} />
          <Row label="Verification route" value={profile.verificationRoute} note={describeKeySituation(profile)} />
          <Row
            label="Usable with EVM tooling"
            value={profile.keyType === "ECDSA" ? "yes" : "no"}
            tone={profile.keyType === "ECDSA" ? "good" : "bad"}
            note={
              profile.keyType === "ECDSA"
                ? undefined
                : "Cannot deploy contracts or sign EVM transactions. The key type is fixed at account creation and cannot be changed."
            }
          />
        </div>
      </div>

      {/* ---------------- association ---------------- */}
      <div className="card bg-base-100 shadow">
        <div className="card-body">
          <h2 className="card-title text-base">Holding tokens</h2>
          <Row
            label="Automatic slots"
            value={slots === -1 ? "unlimited (-1)" : slots}
            tone={slots === -1 ? "good" : slots > 0 ? "good" : "bad"}
            note={
              slots === -1
                ? "HIP-23 unlimited. Any token sent here associates on arrival with no approval."
                : slots > 0
                  ? "Tokens arriving will consume a slot until these run out."
                  : "No free slots. A transfer of a new token to this account right now FAILS with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT."
            }
          />
          <div className="flex items-center gap-2 py-2">
            <div className="sm:w-56 shrink-0 text-sm opacity-70">HBAR balance</div>
            <div className="font-mono text-sm">{balance ? `${tinybarToHbar(balance.value)} ℏ` : "unavailable"}</div>
            {balance ? (
              <SourceBadge source={balance.source} mayBeStale={balance.mayBeStale} asOf={balance.asOf} />
            ) : null}
          </div>
        </div>
      </div>

      {/* ---------------- the strategy explainer: the product thesis ---------------- */}
      {strategy ? (
        <div className="card bg-primary text-primary-content shadow">
          <div className="card-body">
            <h2 className="card-title text-base">If you sent this account a new token: {strategy.name}</h2>
            <p className="leading-relaxed">{selection.reason}</p>
            <p className="text-sm opacity-80">
              Answered from the <strong>sender&apos;s</strong> side — you are looking at an account you do not control
              and cannot ask to sign. If it were your own wallet, the kit would have more options; that case is on{" "}
              <code>/acquire</code>.
            </p>
            <div className="grid sm:grid-cols-3 gap-3 mt-2 text-sm">
              <div>
                <div className="opacity-70">Mechanism</div>
                <div className="font-mono">{strategy.mechanism}</div>
              </div>
              <div>
                <div className="opacity-70">Fee paid by</div>
                <div className="font-mono">{selection.paidBy}</div>
              </div>
              <div>
                <div className="opacity-70">Approvals from recipient</div>
                <div className="font-mono">{selection.recipientApprovals}</div>
              </div>
            </div>
            {selection.alternatives.length > 0 && (
              <p className="text-sm opacity-80 mt-2">Would also have worked: {selection.alternatives.join(", ")}.</p>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

const DiagnosePage: NextPage<{ searchParams: Promise<{ account?: string }> }> = async ({ searchParams }) => {
  const { account } = await searchParams;

  return (
    <div className="max-w-4xl w-full mx-auto px-5 py-10 flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold mb-1">Diagnose an account</h1>
        <p className="text-sm opacity-70">
          Paste any Hedera account id or EVM address. Every read here is public — no wallet, no key, no{" "}
          <code>.env</code>.
        </p>
      </div>

      <Suspense fallback={<div className="skeleton h-12 w-full" />}>
        <DiagnoseForm suggestions={SUGGESTIONS} />
      </Suspense>

      {account ? (
        <Suspense
          key={account}
          fallback={
            <div className="flex flex-col gap-4">
              <div className="skeleton h-40 w-full" />
              <div className="skeleton h-32 w-full" />
            </div>
          }
        >
          <Diagnosis account={account} />
        </Suspense>
      ) : (
        <div className="card bg-base-200">
          <div className="card-body">
            <h2 className="card-title text-base">What this shows</h2>
            <ul className="list-disc list-inside text-sm opacity-80 space-y-1">
              <li>Which of the two address forms you are holding, and whether ECRECOVER can be trusted on it</li>
              <li>The account&apos;s key type, and which signature-verification route applies</li>
              <li>How many automatic association slots are left</li>
              <li>Which of the four association mechanisms the kit would choose, and why</li>
            </ul>
            <p className="text-xs opacity-60 mt-2">
              Pick one of the suggestions above — each was chosen because it demonstrates a different trap.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default DiagnosePage;
