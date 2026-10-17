// Maps the 0-100 linguistic score to a baseline USD value (before TLD,
// keyword-demand, age and comps adjustments), for a plain .com with no
// special keyword.
//
// This is authored as a set of control points rather than a single smooth
// exponential, and log-linearly interpolated between them. An earlier
// version used `15 * 1.12^score`, which grows too fast in the middle of
// the range: a solidly-good-but-ordinary two-word .com (score ~79) came
// out around $115,000 — roughly 10-100x above what that kind of domain
// actually trades for in the aftermarket (commonly low thousands). Real
// aftermarket pricing is much more top-heavy than a smooth exponential:
// the long tail is cheap and flat, and only the very best scores command
// a real premium. The control points below are set to roughly track that
// shape, grounded in generally-known aftermarket price bands (not any
// single transaction):
//   - long-tail / weak strings: near registration-fee cost
//   - decent two-word brandable .com: commonly low thousands
//   - solid single dictionary-word .com: commonly five figures
//   - only truly exceptional (very short / clean) strings reach six
//     figures on the formula alone — real six-figure-plus sales are
//     usually either an exact comp match or carry a keyword-demand
//     multiplier on top of this baseline, not the baseline itself.
const CONTROL_POINTS: [score: number, usd: number][] = [
    [0, 8],
    [10, 11],
    [20, 15],
    [30, 25],
    [40, 55],
    [50, 130],
    [60, 350],
    [70, 1_400],
    [80, 7_500],
    [90, 55_000],
    [95, 130_000],
    [100, 260_000],
];

export function baselineValueUsd(score: number): number {
    const clamped = Math.max(0, Math.min(100, score));

    for (let i = 0; i < CONTROL_POINTS.length - 1; i++) {
        const [lowScore, lowUsd] = CONTROL_POINTS[i]!;
        const [highScore, highUsd] = CONTROL_POINTS[i + 1]!;
        if (clamped >= lowScore && clamped <= highScore) {
            const frac = highScore === lowScore ? 0 : (clamped - lowScore) / (highScore - lowScore);
            // Interpolate in log-space so the curve is smooth (a straight
            // line on a log-price chart) rather than jumping linearly
            // between control points.
            const logLow = Math.log(lowUsd);
            const logHigh = Math.log(highUsd);
            return Math.exp(logLow + frac * (logHigh - logLow));
        }
    }

    return CONTROL_POINTS[CONTROL_POINTS.length - 1]![1];
}
