import { NextResponse } from "next/server";
import {
  OnboardingError,
  associationState,
  explain,
  profileAccount,
  readHbarFromMirror,
  selectStrategy,
} from "~~/lib/onboarding";

/**
 * Everything the acquire flow needs to decide how to make an account able to
 * hold a token — gathered server-side in one round trip.
 *
 * This runs on the server so the browser never needs a relay URL, an API key,
 * or any credential. It reads only public data.
 *
 * GET /api/onboarding/profile?account=0.0.2&token=0.0.5133110
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const account = searchParams.get("account");
  const token = searchParams.get("token");

  if (!account) {
    return NextResponse.json({ error: explain("MISSING_ACCOUNT") }, { status: 400 });
  }

  try {
    const profile = await profileAccount(account);

    const [balance, association] = await Promise.all([
      readHbarFromMirror(profile.accountId).catch(() => null),
      // Pass the slot count, or the verdict cannot tell "not associated"
      // apart from "the transfer will fail" — see associationState().
      token ? associationState(profile.accountId, token, {}, profile.freeAutoAssociationSlots) : Promise.resolve(null),
    ]);

    const hasHbar = balance ? (balance.value as bigint) > 0n : false;

    const selection = selectStrategy({
      alreadyAssociated: association?.associated ?? false,
      freeAutoSlots: profile.autoAssociationSlots,
      // The connected wallet IS the recipient here: it can sign, by definition.
      recipientCanSign: true,
      recipientHasHbarForFees: hasHbar,
      senderControlsRecipient: false,
      preferSingleApproval: true,
      batchSupported: true,
    });

    return NextResponse.json({
      profile,
      association,
      selection,
      // bigint is not JSON-serialisable; send the display string instead.
      hbar: balance
        ? { tinybar: (balance.value as bigint).toString(), source: balance.source, asOf: balance.asOf }
        : null,
    });
  } catch (error) {
    let explanation = error instanceof OnboardingError ? error.explanation : explain(error);

    // A 0x address the mirror node has never heard of is almost never a typo —
    // it is a wallet that has not been funded yet. On Hedera an EVM address is
    // not an account until it first RECEIVES hbar, at which point the network
    // creates a hollow account for it. A fresh burner wallet therefore looks
    // like "this account does not exist" rather than "balance 0", which is
    // confusing the first time and is the single most likely thing a judge
    // opening this template with an empty wallet will hit.
    if (explanation.code === "INVALID_ACCOUNT_ID" && /^0x[0-9a-fA-F]{40}$/.test(account)) {
      explanation = explain("ACCOUNT_NOT_YET_CREATED");
    }

    const status =
      explanation.code === "INVALID_ACCOUNT_ID" || explanation.code === "ACCOUNT_NOT_YET_CREATED" ? 404 : 502;
    return NextResponse.json({ error: explanation }, { status });
  }
}
