/**
 * Trap #1 — association. The centrepiece.
 *
 * The pitch is NOT "association is hard". Hedera shipped three protocol
 * changes at this problem and produced four mechanisms:
 *
 *   explicit    TokenAssociateTransaction    recipient pays, 2 approvals
 *   auto-slot   HIP-23 maxAutomaticTokenAssociations, -1 unlimited
 *   airdrop     HIP-904 TokenAirdropTransaction, SENDER pays
 *   batch       HIP-551 atomic associate + transfer, 1 approval
 *
 * What does not exist anywhere is guidance on which to use when. That
 * decision is this module, and it is deliberately split in two:
 *
 *   selectStrategy()   PURE. No network, no SDK, no signer. This is the
 *                      product, and being pure is what makes it testable,
 *                      reviewable, and portable.
 *   execute*()         The four mechanisms, behind one executor interface so
 *                      the same core runs against a server-side operator or a
 *                      browser wallet.
 *
 * ---------------------------------------------------------------------------
 * THE KIT NEVER PICKS SILENTLY.
 *
 * Every selection returns a `reason` written for a person. The UI renders it
 * verbatim: "Used HIP-904 airdrop: the recipient had no free auto-association
 * slots and no HBAR for fees, so the sender paid." That sentence is the entire
 * thesis of this template rendered in one line, and it is why `reason` is
 * non-optional on AssociationState.
 * ---------------------------------------------------------------------------
 *
 * Framework-free. See AGENTS.md.
 */
import { type MirrorOptions, getPendingAirdrops, getTokenRelationship } from "./mirror";
import { explain } from "./status";
import { type AssociationState, type AssociationStrategy, OnboardingError } from "./types";

/** -1 means unlimited automatic associations. HIP-23. */
export const UNLIMITED_AUTO_SLOTS = -1;

/**
 * Everything the decision needs, and nothing it does not.
 *
 * Deliberately plain data. Gathering it requires the network; deciding from it
 * does not, which is what keeps the decision testable.
 */
export interface StrategyContext {
  /** Already able to hold the token — the cheapest answer is "do nothing". */
  alreadyAssociated: boolean;
  /** Free automatic slots on the RECIPIENT. -1 unlimited, 0 none. */
  freeAutoSlots: number;
  /** Can we realistically ask the recipient to sign something right now? */
  recipientCanSign: boolean;
  /** Does the recipient hold enough HBAR to pay its own fees? */
  recipientHasHbarForFees: boolean;
  /** Can the sender modify the recipient's account (i.e. it controls the key)? */
  senderControlsRecipient: boolean;
  /** Does the caller want a one-click flow, as users expect from other L1s? */
  preferSingleApproval: boolean;
  /** Set false when the installed SDK or network lacks HIP-551 batching. */
  batchSupported: boolean;
}

export interface StrategySelection {
  strategy: AssociationStrategy | "none";
  /** A sentence a person can read. Always populated. */
  reason: string;
  /** Who pays the association fee under this strategy. */
  paidBy: "recipient" | "sender" | "nobody";
  /** How many signatures the recipient must produce. */
  recipientApprovals: number;
  /** Strategies that would also have worked, cheapest-first. */
  alternatives: AssociationStrategy[];
}

/**
 * The decision tree. Pure, synchronous, and the heart of the template.
 *
 * Order matters and is not arbitrary — each branch is cheaper for the user
 * than the one below it:
 *
 *   1. already associated        no transaction at all
 *   2. free auto-slot            no extra approval; the transfer just works
 *   3. sender controls recipient set slots once, then every future token is free
 *   4. batch                     one approval instead of two
 *   5. explicit                  the baseline everybody knows
 *   6. airdrop                   recipient cannot act; the sender pays instead
 */
export function selectStrategy(context: StrategyContext): StrategySelection {
  const {
    alreadyAssociated,
    freeAutoSlots,
    recipientCanSign,
    recipientHasHbarForFees,
    senderControlsRecipient,
    preferSingleApproval,
    batchSupported,
  } = context;

  if (alreadyAssociated) {
    return {
      strategy: "none",
      reason:
        "This account can already hold that token, so no association is needed. The kit checked before spending anything.",
      paidBy: "nobody",
      recipientApprovals: 0,
      alternatives: [],
    };
  }

  const hasFreeSlot = freeAutoSlots === UNLIMITED_AUTO_SLOTS || freeAutoSlots > 0;

  if (hasFreeSlot) {
    return {
      strategy: "auto-slot",
      reason:
        freeAutoSlots === UNLIMITED_AUTO_SLOTS
          ? "The recipient accepts unlimited automatic associations (HIP-23), so the transfer associates the token on arrival with no extra approval."
          : `The recipient has ${freeAutoSlots} free automatic association slot${freeAutoSlots === 1 ? "" : "s"} (HIP-23), so the transfer consumes one on arrival with no extra approval.`,
      paidBy: "recipient",
      recipientApprovals: 0,
      alternatives: buildAlternatives(context, "auto-slot"),
    };
  }

  if (senderControlsRecipient && recipientCanSign) {
    return {
      strategy: "auto-slot",
      reason:
        "The recipient has no free automatic slots, but the sender controls that account, so the kit raises maxAutomaticTokenAssociations once (HIP-23). Every future token then arrives with no approval at all.",
      paidBy: "recipient",
      recipientApprovals: 1,
      alternatives: buildAlternatives(context, "auto-slot"),
    };
  }

  const recipientCanPay = recipientCanSign && recipientHasHbarForFees;

  if (recipientCanPay && batchSupported && preferSingleApproval) {
    return {
      strategy: "batch",
      reason:
        "The recipient can sign and pay, so the kit batches the association and the transfer into one atomic transaction (HIP-551) — one approval instead of two, and no window in which the token is associated but not delivered.",
      paidBy: "recipient",
      recipientApprovals: 1,
      alternatives: buildAlternatives(context, "batch"),
    };
  }

  if (recipientCanPay) {
    return {
      strategy: "explicit",
      reason:
        "The recipient can sign and holds HBAR for fees, so the kit associates explicitly first and then transfers. Two approvals, and the most widely understood path.",
      paidBy: "recipient",
      recipientApprovals: 2,
      alternatives: buildAlternatives(context, "explicit"),
    };
  }

  // Nothing above worked: the recipient cannot sign, or cannot pay, or both.
  // HIP-904 exists precisely for this, and it is the case every other template
  // leaves the developer to discover on their own.
  return {
    strategy: "airdrop",
    reason: !recipientCanSign
      ? "The recipient cannot be asked to sign — it is an account the sender does not control and cannot prompt. The kit sends an HIP-904 airdrop instead, where the SENDER pays the association fee and the recipient claims when ready."
      : "The recipient can sign but has no HBAR to pay fees with. The kit sends an HIP-904 airdrop instead, where the SENDER pays the association fee.",
    paidBy: "sender",
    recipientApprovals: 0,
    alternatives: buildAlternatives(context, "airdrop"),
  };
}

/** How a candidate fared against a given situation. */
export type StrategyVerdict = "chosen" | "viable" | "unavailable";

/** One of the four mechanisms, judged against a situation. */
export interface StrategyEvaluation {
  strategy: AssociationStrategy;
  verdict: StrategyVerdict;
  /** Which HIP introduced it, where one did. */
  hip: string | null;
  /** Why this verdict, in a sentence a person can read. */
  reason: string;
  paidBy: "recipient" | "sender";
  recipientApprovals: number;
}

/** Fixed facts about each mechanism, independent of any situation. */
const STRATEGY_FACTS: Record<AssociationStrategy, { hip: string | null; paidBy: "recipient" | "sender" }> = {
  explicit: { hip: null, paidBy: "recipient" },
  "auto-slot": { hip: "HIP-23", paidBy: "recipient" },
  airdrop: { hip: "HIP-904", paidBy: "sender" },
  batch: { hip: "HIP-551", paidBy: "recipient" },
};

/**
 * Judge all four mechanisms against one situation, not just the winner.
 *
 * `selectStrategy` answers "what will the kit do". This answers "and what
 * about the other three" — which is the question a developer actually has
 * when they are deciding whether to trust the kit's choice.
 *
 * Rejected candidates keep a full explanation rather than being hidden or
 * greyed out. A diagnostic tool that dims the reasoning has thrown away the
 * thing it exists to show.
 *
 * Pure. Derives its verdicts from the same `StrategyContext` that drives
 * `selectStrategy`, so the two cannot disagree — a test asserts that.
 */
export function evaluateStrategies(context: StrategyContext): StrategyEvaluation[] {
  const chosen = selectStrategy(context).strategy;
  const canPay = context.recipientCanSign && context.recipientHasHbarForFees;
  const hasFreeSlot = context.freeAutoSlots === UNLIMITED_AUTO_SLOTS || context.freeAutoSlots > 0;
  const canRaiseSlots = context.senderControlsRecipient && context.recipientCanSign;

  const build = (
    strategy: AssociationStrategy,
    available: boolean,
    approvals: number,
    available_reason: string,
    blocked_reason: string,
  ): StrategyEvaluation => ({
    strategy,
    verdict: strategy === chosen ? "chosen" : available ? "viable" : "unavailable",
    hip: STRATEGY_FACTS[strategy].hip,
    paidBy: STRATEGY_FACTS[strategy].paidBy,
    recipientApprovals: approvals,
    reason: available ? available_reason : blocked_reason,
  });

  return [
    build(
      "auto-slot",
      hasFreeSlot || canRaiseSlots,
      hasFreeSlot ? 0 : 1,
      hasFreeSlot
        ? context.freeAutoSlots === UNLIMITED_AUTO_SLOTS
          ? "The recipient accepts unlimited automatic associations, so the transfer associates on arrival."
          : `The recipient has ${context.freeAutoSlots} free slot${context.freeAutoSlots === 1 ? "" : "s"}, consumed on arrival.`
        : "No free slots, but the sender controls this account and can raise the limit once.",
      "The recipient has no free automatic slots and the sender cannot raise the limit on an account it does not control.",
    ),
    build(
      "batch",
      canPay && context.batchSupported,
      1,
      "The recipient can sign and pay, so associate and transfer fit in one atomic transaction — one approval, and no window where the token is associated but undelivered.",
      !context.batchSupported
        ? "Batching is unavailable: the installed SDK or the target network does not support HIP-551."
        : !context.recipientCanSign
          ? "Batching needs a signature from the recipient, and this account cannot be asked to sign."
          : "Batching needs the recipient to pay its own fees, and this account holds no HBAR.",
    ),
    build(
      "explicit",
      canPay,
      2,
      "The recipient can sign and holds HBAR, so it can associate first and then receive. Two approvals — the most widely understood path.",
      !context.recipientCanSign
        ? "An explicit association must be signed by the recipient, and this account cannot be asked to sign."
        : "An explicit association is paid by the recipient, and this account holds no HBAR for fees.",
    ),
    build(
      "airdrop",
      true, // always works: it asks nothing of the recipient
      0,
      "Always available. The sender pays and the token sits pending until the recipient claims it — so it works even for an account that cannot sign and holds no HBAR.",
      "",
    ),
  ];
}

/** Which other strategies would also have worked, for the /diagnose route. */
function buildAlternatives(context: StrategyContext, chosen: AssociationStrategy): AssociationStrategy[] {
  const viable: AssociationStrategy[] = [];
  const canPay = context.recipientCanSign && context.recipientHasHbarForFees;

  if (context.freeAutoSlots === UNLIMITED_AUTO_SLOTS || context.freeAutoSlots > 0) {
    viable.push("auto-slot");
  }
  if (canPay && context.batchSupported) viable.push("batch");
  if (canPay) viable.push("explicit");
  // The airdrop path always works: it needs nothing from the recipient.
  viable.push("airdrop");

  return viable.filter(strategy => strategy !== chosen);
}

/**
 * Is this account able to hold this token right now, and if not, why not?
 *
 * A wallet-free read. Checking first is what stops the kit paying for a
 * redundant association, and it is why TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT is
 * treated as success rather than as an error.
 */
export async function associationState(
  accountId: string,
  tokenId: string,
  options: MirrorOptions = {},
): Promise<AssociationState> {
  const relationship = await getTokenRelationship(accountId, tokenId, options);

  if (relationship) {
    return {
      associated: true,
      reason: relationship.automaticAssociation
        ? "Associated automatically when the token first arrived, using a HIP-23 slot."
        : "Explicitly associated, so this account can hold the token.",
    };
  }

  return {
    associated: false,
    reason:
      "Not associated and no automatic slot has been used. A transfer to this account right now fails with TOKEN_NOT_ASSOCIATED_TO_ACCOUNT.",
  };
}

/**
 * Abstracts "execute a transaction", so the same core runs server-side against
 * an operator client and in the browser against a wallet.
 *
 * Keeping this an interface rather than importing a Client is what preserves
 * the framework-free rule: nothing here knows whether a React wallet adapter
 * or a Node script is on the other side.
 */
export interface AssociationExecutor {
  /**
   * Execute a built transaction and return its receipt details.
   * Implementations live outside lib/ — see hooks/onboarding/.
   */
  execute(request: AssociationRequest): Promise<AssociationReceipt>;
  /** True when the installed SDK and target network support HIP-551 batching. */
  supportsBatch(): boolean;
}

export interface AssociationRequest {
  strategy: AssociationStrategy;
  accountId: string;
  tokenId: string;
  /** Present for airdrop and batch, which move value as well as associating. */
  amount?: bigint;
  senderId?: string;
  /** For the auto-slot path: the new maximum. -1 for unlimited. */
  maxAutomaticTokenAssociations?: number;
}

export interface AssociationReceipt {
  transactionId: string;
  /** Hedera status, e.g. SUCCESS. */
  status: string;
  /** True when HIP-904 produced a pending airdrop needing a claim. */
  pending?: boolean;
}

/** HashScan link for a transaction id. Testnet only, by design. */
export function hashscanUrl(transactionId: string, network: "testnet" | "mainnet" = "testnet"): string {
  return `https://hashscan.io/${network}/transaction/${encodeURIComponent(transactionId)}`;
}

/**
 * Make an account able to hold a token, and say which of the four mechanisms
 * was used and why.
 *
 * `strategy` may be forced. Leaving it undefined lets the kit choose — but the
 * choice is still reported rather than hidden, because a developer reading
 * this template needs to learn the decision, not just benefit from it.
 */
export async function ensureAssociated(params: {
  accountId: string;
  tokenId: string;
  context: StrategyContext;
  executor: AssociationExecutor;
  amount?: bigint;
  senderId?: string;
  /** Force a specific mechanism, overriding the decision tree. */
  strategy?: AssociationStrategy;
  network?: "testnet" | "mainnet";
}): Promise<AssociationState> {
  const { accountId, tokenId, context, executor, amount, senderId, network = "testnet" } = params;

  const selection = params.strategy
    ? {
        strategy: params.strategy,
        reason: `Strategy forced to "${params.strategy}" by the caller, overriding the kit's recommendation.`,
        paidBy: "recipient" as const,
        recipientApprovals: 1,
        alternatives: [],
      }
    : selectStrategy({ ...context, batchSupported: executor.supportsBatch() });

  if (selection.strategy === "none") {
    return { associated: true, reason: selection.reason };
  }

  try {
    const receipt = await executor.execute({
      strategy: selection.strategy,
      accountId,
      tokenId,
      amount,
      senderId,
      maxAutomaticTokenAssociations: selection.strategy === "auto-slot" ? UNLIMITED_AUTO_SLOTS : undefined,
    });

    return {
      // A pending airdrop is NOT an association yet: the recipient still has to
      // claim it. Reporting it as associated would be the same lie every other
      // integration tells, one layer down.
      associated: !receipt.pending,
      strategyUsed: selection.strategy,
      reason: receipt.pending
        ? `${selection.reason} The recipient has no free slot, so it is waiting as a pending airdrop until they claim it.`
        : selection.reason,
      transactionId: receipt.transactionId,
      hashscanUrl: hashscanUrl(receipt.transactionId, network),
    };
  } catch (cause) {
    // Already associated is success, not failure — a race with another caller.
    const explanation = explain(cause);
    if (explanation.code === "TOKEN_ALREADY_ASSOCIATED_TO_ACCOUNT") {
      return {
        associated: true,
        reason:
          "Already associated by the time the transaction landed — another caller got there first. Treated as success.",
      };
    }
    throw new OnboardingError(explanation, cause);
  }
}

/** Pending HIP-904 airdrops waiting on this account. Wallet-free read. */
export async function pendingAirdropsFor(
  accountId: string,
  options: MirrorOptions = {},
): Promise<{ tokenId: string; senderId: string; amount: bigint }[]> {
  const pending = await getPendingAirdrops(accountId, options);
  return pending.map(entry => ({
    tokenId: entry.tokenId,
    senderId: entry.senderId,
    amount: entry.amount as bigint,
  }));
}

/** Human summary of a strategy, for the /diagnose comparison table. */
export function describeStrategy(strategy: AssociationStrategy): {
  name: string;
  mechanism: string;
  paidBy: string;
  approvals: string;
  useWhen: string;
} {
  switch (strategy) {
    case "explicit":
      return {
        name: "Explicit",
        mechanism: "TokenAssociateTransaction",
        paidBy: "Recipient",
        approvals: "2 (associate, then transfer)",
        useWhen: "The user is present, holds HBAR, and you can ask for a signature. The baseline everyone knows.",
      };
    case "auto-slot":
      return {
        name: "Auto-slot",
        mechanism: "HIP-23 maxAutomaticTokenAssociations",
        paidBy: "Recipient, charged on use",
        approvals: "1 (or 0 if slots already exist)",
        useWhen: "The account will receive many token types and you want no interruption at transfer time.",
      };
    case "airdrop":
      return {
        name: "Airdrop",
        mechanism: "HIP-904 TokenAirdropTransaction",
        paidBy: "Sender",
        approvals: "1 by the sender; the recipient claims later",
        useWhen:
          "Distributing to accounts you do not control and cannot ask to pre-associate. The only path that needs nothing from the recipient.",
      };
    case "batch":
      return {
        name: "Batch",
        mechanism: "HIP-551 atomic associate + transfer",
        paidBy: "Depends on composition",
        approvals: "1",
        useWhen:
          "You want the single-click flow users expect from other L1s, with no window where the token is associated but undelivered.",
      };
  }
}
