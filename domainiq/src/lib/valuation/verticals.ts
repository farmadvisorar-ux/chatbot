export interface VerticalInfo {
    label: string;
    heat: 'high' | 'medium' | 'low';
    /** Extra multiplier applied only to the outbound/proactive-pitch price band. */
    outboundHeatMultiplier: number;
    note: string;
}

// Hand-curated, not a live feed. This is a proxy for "where funded / high-CAC
// buyers currently concentrate," reasoned from generally-known 2020s
// investment and business trends — not pulled from Crunchbase, PitchBook, or
// any funding database. Treat the "heat" tier as a directional signal for
// how much more a proactive outbound pitch can realistically command versus
// a passive inbound sale, not a claim about any specific company's funding.
export const VERTICAL_HEAT: Record<string, VerticalInfo> = {
    ai: { label: 'AI / ML', heat: 'high', outboundHeatMultiplier: 1.8, note: 'Sustained high funding volume into AI-native products since 2023.' },
    saas: { label: 'B2B SaaS', heat: 'high', outboundHeatMultiplier: 1.5, note: 'Consistently well-funded category; buyers have real budget for a strong domain.' },
    finance: { label: 'Fintech', heat: 'high', outboundHeatMultiplier: 1.6, note: 'High customer-acquisition costs make a strong .com a meaningful trust signal.' },
    crypto: { label: 'Web3 / Crypto', heat: 'medium', outboundHeatMultiplier: 1.3, note: 'Cyclical funding; strong when the market is up, soft when it is not.' },
    health: { label: 'HealthTech', heat: 'high', outboundHeatMultiplier: 1.5, note: 'Regulatory-heavy category where buyers pay a premium for a trustworthy, brandable name.' },
    'real-estate': { label: 'PropTech', heat: 'medium', outboundHeatMultiplier: 1.3, note: 'Steady, less bubble-prone funding than pure consumer tech.' },
    legal: { label: 'LegalTech', heat: 'medium', outboundHeatMultiplier: 1.3, note: 'Smaller buyer pool but high willingness-to-pay per deal.' },
    business: { label: 'B2B / Business Services', heat: 'medium', outboundHeatMultiplier: 1.25, note: 'Broad category; premium depends heavily on the specific niche.' },
    travel: { label: 'Travel', heat: 'low', outboundHeatMultiplier: 1.05, note: 'Recovered post-pandemic but not a high-growth-funding category.' },
    gaming: { label: 'Gaming / iGaming', heat: 'medium', outboundHeatMultiplier: 1.3, note: 'High-value niche with well-capitalized operators, especially in regulated betting.' },
    retail: { label: 'E-commerce / Retail', heat: 'low', outboundHeatMultiplier: 1.1, note: 'Large market but thin margins limit domain acquisition budgets outside top brands.' },
    auto: { label: 'Auto', heat: 'low', outboundHeatMultiplier: 1.05, note: 'Stable, unglamorous category with modest domain budgets.' },
    food: { label: 'Food & Beverage', heat: 'low', outboundHeatMultiplier: 1.05, note: 'Large category, but domain spend is rarely a funded-startup priority.' },
    tech: { label: 'General Tech', heat: 'medium', outboundHeatMultiplier: 1.25, note: 'Broad; premium depends on the specific sub-category.' },
    'local-services': { label: 'Local Services', heat: 'low', outboundHeatMultiplier: 1.0, note: 'Owner-operator buyers, rarely funded, price-sensitive.' },
    education: { label: 'EdTech', heat: 'medium', outboundHeatMultiplier: 1.2, note: 'Moderate funding activity, budget-conscious buyers.' },
    community: { label: 'Community / Social', heat: 'low', outboundHeatMultiplier: 1.0, note: 'Hard to monetize category; domain budgets are typically small.' },
    content: { label: 'Media / Content', heat: 'low', outboundHeatMultiplier: 1.0, note: 'Ad-revenue-dependent; domain budgets are typically small.' },
    other: { label: 'General / Unclassified', heat: 'low', outboundHeatMultiplier: 1.0, note: 'No specific vertical signal detected.' },
};

export function getVerticalInfo(category: string | null): VerticalInfo {
    if (!category) return VERTICAL_HEAT.other!;
    return VERTICAL_HEAT[category] ?? VERTICAL_HEAT.other!;
}
