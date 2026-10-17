import type { VerticalInfo } from './verticals';

export interface PriceBand {
    lowUsd: number;
    highUsd: number;
}

export interface LeasePlan {
    monthlyUsd: number;
    termMonths: number;
    totalUsd: number;
}

export interface ChannelPricing {
    /** Quick liquidation floor (48h no-reserve cash-out auction exit). */
    liquidationFloor: number;
    /** Quick sale to another domain investor/liquidator — the discount reflects speed over price. */
    wholesale: PriceBand;
    /** Recommended minimum auction reserve price. */
    recommendedReserve: number;
    /** A passive end-user buyer paying a listed Buy-It-Now price on a landing page. */
    inboundBin: PriceBand;
    /** Recommended optimized charm price for landing pages (e.g. $4,950 or $2,888). */
    recommendedBinPrice: number;
    /** 12, 24, and 36-month installment financing plans. */
    leaseToOwn: {
        months12: LeasePlan;
        months24: LeasePlan;
        months36: LeasePlan;
    };
    /** Maximum realistic value proactively pitching a funded/established business that needs this exact name. */
    outboundTarget: PriceBand;
}

/**
 * Calculates domain industry standard "charm pricing" for BIN landing pages.
 * Buyers convert significantly higher on clean psychological price tags
 * ($2,488, $4,950, $9,800, etc.) rather than unrounded algorithmic figures.
 */
export function calculateCharmPrice(rawPrice: number): number {
    if (rawPrice <= 300) return Math.max(99, Math.round(rawPrice / 10) * 10);
    if (rawPrice <= 1500) return Math.round(rawPrice / 50) * 50;
    if (rawPrice <= 5000) {
        const thousands = Math.floor(rawPrice / 1000);
        const remainder = rawPrice % 1000;
        if (remainder < 350) return thousands * 1000 + 488;
        if (remainder < 750) return thousands * 1000 + 750;
        return thousands * 1000 + 950;
    }
    if (rawPrice <= 25000) {
        const thousands = Math.floor(rawPrice / 1000);
        const remainder = rawPrice % 1000;
        return thousands * 1000 + (remainder >= 500 ? 888 : 500);
    }
    return Math.round(rawPrice / 1000) * 1000;
}

/**
 * Splits the single blended estimate into the practical sales channels
 * that exist across the domain aftermarket, plus installment lease-to-own models.
 */
export function computeChannelPricing(params: {
    lowUsd: number;
    midUsd: number;
    highUsd: number;
    vertical: VerticalInfo;
}): ChannelPricing {
    const { lowUsd, midUsd, highUsd, vertical } = params;

    const wholesale: PriceBand = {
        lowUsd: Math.max(50, Math.round(midUsd * 0.22)),
        highUsd: Math.max(100, Math.round(midUsd * 0.48)),
    };

    const liquidationFloor = Math.max(35, Math.round(midUsd * 0.12));
    const recommendedReserve = Math.max(50, Math.round(wholesale.lowUsd * 0.9));

    const inboundBin: PriceBand = {
        lowUsd: Math.round(lowUsd),
        highUsd: Math.round(highUsd),
    };

    const recommendedBinPrice = calculateCharmPrice(midUsd);

    // Standard domain installment markup (12-18% financing convenience spread)
    const total12 = Math.round(recommendedBinPrice * 1.10);
    const total24 = Math.round(recommendedBinPrice * 1.16);
    const total36 = Math.round(recommendedBinPrice * 1.22);

    const leaseToOwn = {
        months12: {
            monthlyUsd: Math.round(total12 / 12),
            termMonths: 12,
            totalUsd: total12,
        },
        months24: {
            monthlyUsd: Math.round(total24 / 24),
            termMonths: 24,
            totalUsd: total24,
        },
        months36: {
            monthlyUsd: Math.round(total36 / 36),
            termMonths: 36,
            totalUsd: total36,
        },
    };

    const outboundTarget: PriceBand = {
        lowUsd: Math.round(midUsd * vertical.outboundHeatMultiplier * 1.15),
        highUsd: Math.round(highUsd * vertical.outboundHeatMultiplier * 2.0),
    };

    return {
        liquidationFloor,
        wholesale,
        recommendedReserve,
        inboundBin,
        recommendedBinPrice,
        leaseToOwn,
        outboundTarget,
    };
}

/**
 * 0-10 "how well does this domain fit a proactive outbound sales motion" score.
 */
export function computeOutboundFitScore(params: {
    vertical: VerticalInfo;
    hasKeywordMatch: boolean;
    compositionScore: number;
    tldAuthority: number;
}): number {
    const { vertical, hasKeywordMatch, compositionScore, tldAuthority } = params;

    let score = 0;
    if (vertical.heat === 'high') score += 4;
    else if (vertical.heat === 'medium') score += 2.5;
    else score += 1;

    if (hasKeywordMatch) score += 2.5;
    if (compositionScore >= 80) score += 2;
    else if (compositionScore >= 50) score += 1;

    if (tldAuthority >= 80) score += 1.5;
    else if (tldAuthority >= 50) score += 1;

    return Math.min(10, Math.round(score * 10) / 10);
}
