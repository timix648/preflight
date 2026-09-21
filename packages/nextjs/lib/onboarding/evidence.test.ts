/**
 * The guarantee these tests protect: the proof panel cannot drift away from
 * the transactions it describes.
 *
 * This template's entire argument is that its claims are checkable. A hero
 * panel showing a duration that no longer matches its own transactions, or a
 * link that 404s on HashScan, is worse than no panel — it converts the one
 * verifiable thing into a liability. These tests fail the build rather than
 * let that ship.
 */
import { hashscanUrl } from "./association";
import {
  EVIDENCE_ACCOUNTS,
  EVIDENCE_BEATS,
  EVIDENCE_TOKEN,
  evidenceElapsedSeconds,
  evidenceOffsetSeconds,
} from "./evidence";
import { describe, expect, it } from "vitest";

describe("the three beats are the three beats", () => {
  it("has_exactly_three_in_before_act_after_order", () => {
    expect(EVIDENCE_BEATS).toHaveLength(3);
    expect(EVIDENCE_BEATS.map(b => b.phase)).toEqual(["before", "act", "after"]);
  });

  it("consensus_timestamps_ascend_so_the_story_is_in_network_order", () => {
    const consensus = EVIDENCE_BEATS.map(b => b.consensus);
    const sorted = [...consensus].sort((a, b) => a - b);
    expect(consensus).toEqual(sorted);
  });

  it("the_before_beat_failed_and_moved_nothing", () => {
    const before = EVIDENCE_BEATS[0];
    expect(before.ok).toBe(false);
    expect(before.status).toBe("TOKEN_NOT_ASSOCIATED_TO_ACCOUNT");
    // The whole point: the transfer was rejected, so no tokens moved.
    expect(before.tokensMoved).toBeNull();
  });

  it("the_after_beat_succeeded_and_moved_tokens", () => {
    const after = EVIDENCE_BEATS[2];
    expect(after.ok).toBe(true);
    expect(after.status).toBe("SUCCESS");
    expect(after.tokensMoved).toContain(EVIDENCE_ACCOUNTS.sender);
    expect(after.tokensMoved).toContain(EVIDENCE_ACCOUNTS.recipient);
  });

  it("the_first_and_last_are_the_same_transfer_from_the_same_sender", () => {
    // Both transfers were built by the sender; only the association differs.
    for (const beat of EVIDENCE_BEATS) {
      expect(beat.transactionId.startsWith(`${EVIDENCE_ACCOUNTS.sender}-`)).toBe(true);
    }
  });
});

describe("every beat is checkable", () => {
  it("transaction_ids_are_well_formed_hedera_ids", () => {
    // shard.realm.num-seconds-nanos, the hyphenated form HashScan accepts in a URL
    for (const beat of EVIDENCE_BEATS) {
      expect(beat.transactionId).toMatch(/^\d+\.\d+\.\d+-\d+-\d+$/);
    }
  });

  it("ids_are_distinct_so_no_beat_links_to_another", () => {
    const ids = new Set(EVIDENCE_BEATS.map(b => b.transactionId));
    expect(ids.size).toBe(EVIDENCE_BEATS.length);
  });

  it("builds_a_testnet_hashscan_url_that_survives_encoding", () => {
    const url = hashscanUrl(EVIDENCE_BEATS[0].transactionId);
    // The hyphenated form contains no characters encodeURIComponent rewrites,
    // so the link must come out byte-identical to the one in EVIDENCE.md.
    expect(url).toBe("https://hashscan.io/testnet/transaction/0.0.10505627-1789836087-477565839");
  });

  it("every_beat_carries_a_sentence_a_reader_can_check", () => {
    for (const beat of EVIDENCE_BEATS) {
      expect(beat.note.length).toBeGreaterThan(20);
    }
  });
});

describe("elapsed time is derived, never asserted", () => {
  it("matches_the_span_between_first_and_last_consensus", () => {
    const first = EVIDENCE_BEATS[0].consensus;
    const last = EVIDENCE_BEATS[EVIDENCE_BEATS.length - 1].consensus;
    expect(evidenceElapsedSeconds()).toBeCloseTo(last - first, 3);
  });

  it("follows_the_data_when_the_data_changes", () => {
    // Re-running `yarn hardhat:evidence` produces new transactions. The
    // duration must follow them rather than staying at whatever was hard-coded.
    const moved = EVIDENCE_BEATS.map((b, i) => ({ ...b, consensus: i === 2 ? b.consensus + 5 : b.consensus }));
    expect(evidenceElapsedSeconds(moved)).toBeCloseTo(evidenceElapsedSeconds() + 5, 3);
  });

  it("offsets_start_at_zero_and_ascend", () => {
    const offsets = EVIDENCE_BEATS.map(b => evidenceOffsetSeconds(b));
    expect(offsets[0]).toBe(0);
    expect(offsets[1]).toBeGreaterThan(0);
    expect(offsets[2]).toBeGreaterThan(offsets[1]);
  });

  it("degenerate_input_does_not_throw", () => {
    expect(evidenceElapsedSeconds([])).toBe(0);
    expect(evidenceElapsedSeconds([EVIDENCE_BEATS[0]])).toBe(0);
  });
});

describe("the token is deliberately not 8 decimals", () => {
  it("uses_two_decimals_because_assuming_eight_is_the_bug", () => {
    // A token at 2dp is the case code that hard-codes 8 gets silently wrong.
    expect(EVIDENCE_TOKEN.decimals).toBe(2);
    expect(EVIDENCE_TOKEN.id).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("sender_and_recipient_are_different_accounts", () => {
    expect(EVIDENCE_ACCOUNTS.sender).not.toBe(EVIDENCE_ACCOUNTS.recipient);
  });
});
