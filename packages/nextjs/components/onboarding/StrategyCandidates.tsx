import { type StrategyContext, describeStrategy, evaluateStrategies } from "~~/lib/onboarding";

/**
 * All four association mechanisms, judged against one situation.
 *
 * The kit picking correctly is only half the product. The other half is a
 * developer being able to see WHY, and to check the reasoning against the
 * other three options rather than taking the recommendation on faith.
 *
 * Two deliberate choices:
 *
 *   Rejected candidates stay fully readable. Dimming them to 40% is the
 *   obvious visual move and it is wrong — the reason a mechanism does NOT
 *   apply is diagnostic content, often the most useful thing on the page.
 *   Unavailability is carried by a label and a border, not by hiding text.
 *
 *   The verdicts come from `evaluateStrategies`, the same pure function the
 *   kit's own decision runs through, so this panel cannot drift away from
 *   what execute() would really do. A test asserts that across every
 *   combination of the inputs.
 *
 * A Server Component. No client JavaScript.
 */
export const StrategyCandidates = ({ context }: { context: StrategyContext }) => {
  const evaluated = evaluateStrategies(context);

  return (
    <section aria-labelledby="candidates-heading">
      <h3 id="candidates-heading" className="text-sm font-bold uppercase tracking-wider opacity-70 mb-1">
        All four mechanisms, against this account
      </h3>
      <p className="text-sm opacity-70 mb-3">
        Hedera shipped three protocol changes at the association problem and produced four ways to solve it. Here is
        how each one fares for this specific account — including the ones that do not apply, and why.
      </p>

      <ul className="flex flex-col gap-2 list-none pl-0">
        {evaluated.map(candidate => {
          const described = describeStrategy(candidate.strategy);
          const isChosen = candidate.verdict === "chosen";
          const isBlocked = candidate.verdict === "unavailable";

          return (
            <li key={candidate.strategy}>
              <div
                className={`card border-2 ${
                  isChosen ? "border-primary bg-primary/5" : isBlocked ? "border-base-300 border-dashed" : "border-base-300"
                }`}
              >
                <div className="card-body p-3 gap-1">
                  <div className="flex items-baseline justify-between flex-wrap gap-2">
                    <span className="flex items-baseline gap-2 flex-wrap">
                      <span className="font-mono text-sm font-semibold">{described.name}</span>
                      {candidate.hip && <span className="badge badge-sm font-mono">{candidate.hip}</span>}
                    </span>
                    <span
                      className={`badge badge-sm font-mono ${
                        isChosen ? "badge-primary" : isBlocked ? "badge-ghost" : "badge-outline"
                      }`}
                    >
                      {isChosen ? "chosen" : isBlocked ? "does not apply" : "would also work"}
                    </span>
                  </div>

                  <p className="text-sm m-0 leading-relaxed">{candidate.reason}</p>

                  {!isBlocked && (
                    <div className="flex gap-4 text-xs font-mono opacity-70 mt-1">
                      <span>fee paid by {candidate.paidBy}</span>
                      {/* Built as one string: JSX inserts whitespace across a
                          line break, which rendered as "0 approval s". */}
                      <span>{`${candidate.recipientApprovals} approval${
                        candidate.recipientApprovals === 1 ? "" : "s"
                      } from recipient`}</span>
                    </div>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
};
