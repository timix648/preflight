/**
 * The three-beat proof.
 *
 * The same token transfer, to the same account, before and after the kit
 * associated the token. Three real transactions on Hedera testnet, all
 * independently verifiable on HashScan.
 *
 * ---------------------------------------------------------------------------
 * THIS FILE CONTAINS NO INVENTED DATA.
 *
 * Every value below is transcribed from `EVIDENCE.md` at the repository root,
 * After a fresh live run, `yarn hardhat:evidence:render` updates this file from
 * completed native reports (with read/EVM validation scoped in EVIDENCE.md).
 * The transaction IDs change with every run. Do not edit a timestamp, a status or an amount here to make the UI
 * read better — the entire point of this template is that its claims are
 * checkable, and a fabricated proof panel would be worse than no proof panel.
 *
 * The elapsed time is DERIVED from the consensus timestamps below, never
 * hard-coded, so it cannot drift away from the transactions it describes.
 * ---------------------------------------------------------------------------
 *
 * On the timestamps: a Hedera transaction id carries the timestamp the CLIENT
 * assigned when it built the transaction, not when the network reached
 * consensus. Under concurrency those ids are not in chronological order. The
 * `consensus` field is the network's own ordering and the only one that means
 * anything, so it is what the UI sorts and subtracts.
 *
 * Framework-free. See AGENTS.md.
 */

/** One beat of the proof. */
export interface EvidenceBeat {
  /** Ordering and intent. */
  phase: "before" | "act" | "after";
  /** Short label for the UI. */
  label: string;
  /** Real transaction id — links to HashScan. */
  transactionId: string;
  /**
   * Consensus timestamp, seconds-and-fraction within the run's epoch window.
   * EVIDENCE.md prints these truncated (`…092.918`); the truncation is
   * cosmetic and the ordering and differences are exact.
   */
  consensus: number;
  /** Network response code, verbatim. */
  status: string;
  /** Did the network accept it. */
  ok: boolean;
  /** Token movement, or null when nothing moved. */
  tokensMoved: string | null;
  /** One sentence a reader can check against HashScan. */
  note: string;
}

/** The token used for the run — generated from verified native evidence. */
export const EVIDENCE_TOKEN = {
  id: "0.0.10727915",
  symbol: "PFE",
  decimals: 2,
} as const;
export const EVIDENCE_ACCOUNTS = {
  sender: "0.0.10727914",
  recipient: "0.0.10727916",
} as const;
export const EVIDENCE_BEATS: readonly EvidenceBeat[] = [
  {
    phase: "before",
    label: "Before",
    transactionId: "0.0.10727914-1790416730-714923658",
    consensus: 0.759866188,
    status: "TOKEN_NOT_ASSOCIATED_TO_ACCOUNT",
    ok: false,
    tokensMoved: null,
    note: "Zero token transfers are attached. Nothing moved, and the sender still paid the fee.",
  },
  {
    phase: "act",
    label: "The kit acts",
    transactionId: "0.0.10727916-1790416739-072577022",
    consensus: 7.183871104,
    status: "SUCCESS",
    ok: true,
    tokensMoved: null,
    note: "The native adapter explicitly associated the token. The recipient authorized and paid for its association.",
  },
  {
    phase: "after",
    label: "After",
    transactionId: "0.0.10727914-1790416742-762508366",
    consensus: 12.22371703,
    status: "SUCCESS",
    ok: true,
    tokensMoved: "0.0.10727914 −100 → 0.0.10727916 +100",
    note: "The identical transfer, to the identical account. The only required state change was the association.",
  },
] as const;

/**
 * Seconds between the failed transfer and the successful one, derived from
 * consensus timestamps. Never hard-code this.
 */
export function evidenceElapsedSeconds(beats: readonly EvidenceBeat[] = EVIDENCE_BEATS): number {
  if (beats.length < 2) return 0;
  const consensus = beats.map(beat => beat.consensus);
  return Math.round((Math.max(...consensus) - Math.min(...consensus)) * 1000) / 1000;
}

/** Offset of a beat from the first, in seconds. Used to label the timeline. */
export function evidenceOffsetSeconds(beat: EvidenceBeat, beats: readonly EvidenceBeat[] = EVIDENCE_BEATS): number {
  const first = Math.min(...beats.map(b => b.consensus));
  return Math.round((beat.consensus - first) * 1000) / 1000;
}
