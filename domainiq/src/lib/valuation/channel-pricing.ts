import type { VerticalInfo } from './verticals';

export interface PriceBand {
    lowUsd: number;
    highUsd: number;
}

export interface ChannelPricing {
    /** Quick sale to another domain investor/liquidator — the discount reflects speed over price. */
    wholesale: PriceBand;
    /** A passive end-user buyer paying a listed Buy-It-Now price on a landing page. */
    inboundBin: PriceBand;
    /** Maximum realistic value proactively pitching a funded/established business that needs this exact name. */
    outboundTarget: PriceBand;
}

/**
 * Splits the single blended estimate into the three price points that
 * actually exist in the domain aftermarket. A single number is close to
 * meaningless without this context — the same domain can reasonably sell
 * for 3-10x more through a targeted outbound pitch than a quick wholesale
 * flip to another investor.
 */
export function computeChannelPricing(params: {
    lowUsd: number;
    midUsd: number;
    highUsd: number;
    vertical: VerticalInfo;
}): ChannelPricing {
    const { lowUsd, midUsd, highUsd, vertical } = params;

    const wholesale: PriceBand = {
        lowUsd: Math.round(midUsd * 0.22),
        highUsd: Math.round(midUsd * 0.5),
    };

    const inboundBin: PriceBand = {
        lowUsd: Math.round(lowUsd),
        highUsd: Math.round(highUsd),
    };

    const outboundTarget: PriceBand = {
        lowUsd: Math.round(midUsd * vertical.outboundHeatMultiplier * 1.15),
        highUsd: Math.round(highUsd * vertical.outboundHeatMultiplier * 2.0),
    };

    return { wholesale, inboundBin, outboundTarget };
}

/**
 * 0-10 "how well does this domain fit a proactive outbound sales motion"
 * score — high vertical capital heat, a genuine keyword match, and clean
 * composition all make outbound pitching realistic; without them, outbound
 * effort rarely beats just listing the domain and waiting for inbound
 * interest.
 */
export function computeOutboundFitScore(params: {
    vertical: VerticalInfo;
    hasKeywordMatch: boolean;
    compositionScore: number;
    tldAuthority: number;
}): number {
    const heatPoints = params.vertical.heat === 'high' ? 4 : params.vertical.heat === 'medium' ? 2.2 : 0.8;
    const keywordPoints = params.hasKeywordMatch ? 2.5 : 0.5;
    const compositionPoints = (params.compositionScore / 100) * 2;
    const tldPoints = (params.tldAuthority / 100) * 1.5;

    const raw = heatPoints + keywordPoints + compositionPoints + tldPoints;
    return Math.round(Math.min(10, raw) * 10) / 10;
}
