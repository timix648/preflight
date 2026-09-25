/** Shared transaction guards. Pure: the UI and the submit handler use the same rules. */
export interface AcquisitionContext {
  account: string;
  tokenId: string;
  chainId: number;
}

export interface QuoteContext {
  token: string;
  hbar: string;
  receivedAt: number;
}

export const QUOTE_MAX_AGE_MS = 30_000;

export function sameAcquisition(a: AcquisitionContext | null, b: AcquisitionContext | null): boolean {
  return (
    !!a &&
    !!b &&
    a.account.toLowerCase() === b.account.toLowerCase() &&
    a.tokenId === b.tokenId &&
    a.chainId === b.chainId
  );
}

export function currentQuote(quote: QuoteContext | null, token: string, hbar: string, now = Date.now()): boolean {
  return (
    !!quote &&
    quote.token === token &&
    quote.hbar === hbar &&
    now >= quote.receivedAt &&
    now - quote.receivedAt < QUOTE_MAX_AGE_MS
  );
}

export function canSubmitSwap(input: {
  current: AcquisitionContext | null;
  profileFor: AcquisitionContext | null;
  associated: boolean;
  quoteFor: QuoteContext | null;
  hbar: string;
  pending: boolean;
  now?: number;
}): boolean {
  return (
    input.current?.chainId === 296 &&
    sameAcquisition(input.current, input.profileFor) &&
    input.associated &&
    !input.pending &&
    currentQuote(input.quoteFor, input.current.tokenId, input.hbar, input.now)
  );
}
