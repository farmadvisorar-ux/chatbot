export interface AffiliatePartner {
    id: string;
    name: string;
    category: 'registration' | 'marketplace' | 'escrow' | 'hosting' | 'brokerage' | 'trademark';
    badge: string;
    headline: (domain: string) => string;
    description: (domain: string) => string;
    ctaText: string;
    affiliateUrl: string; // Replace with your exact affiliate link parameter
    icon: string;
    theme: 'emerald' | 'cyan' | 'indigo' | 'brand' | 'amber';
}

/**
 * Master Affiliate Registry
 * You can replace any 'affiliateUrl' below with your specific affiliate link.
 */
export const AFFILIATE_PARTNERS: AffiliatePartner[] = [
    {
        id: 'namecheap',
        name: 'Namecheap',
        category: 'registration',
        badge: 'Recommended Registrar',
        headline: (domain) => `Secure & Transfer ${domain} with Namecheap`,
        description: (domain) =>
            `Get industry-lowest renewal rates, free lifetime WHOIS privacy protection, and premium DNS security for ${domain}.`,
        ctaText: 'Claim Domain on Namecheap →',
        affiliateUrl: 'https://www.namecheap.com/?aff=YOUR_AFFILIATE_ID',
        icon: '🏷️',
        theme: 'emerald',
    },
    {
        id: 'afternic',
        name: 'Afternic / GoDaddy Network',
        category: 'marketplace',
        badge: 'Global Marketplace Reach',
        headline: (domain) => `List ${domain} Across 85+ Global Registrars`,
        description: (domain) =>
            `Afternic Fast Transfer puts ${domain} directly in the search bar of GoDaddy, Namecheap, and Dynadot when corporate buyers search for it.`,
        ctaText: 'List for Sale on Afternic →',
        affiliateUrl: 'https://www.afternic.com/?aff=YOUR_AFFILIATE_ID',
        icon: '⚡',
        theme: 'brand',
    },
    {
        id: 'dan',
        name: 'Dan.com',
        category: 'marketplace',
        badge: 'Lease-To-Own Seller Financing',
        headline: (domain) => `Enable Monthly Installments for ${domain} on Dan.com`,
        description: (domain) =>
            `Boost your buyer conversion rate by 300% by offering automated 12–36 month Lease-to-Own checkout pages with 9% seller commission.`,
        ctaText: 'Create Dan.com Lander →',
        affiliateUrl: 'https://dan.com/?aff=YOUR_AFFILIATE_ID',
        icon: '💳',
        theme: 'cyan',
    },
    {
        id: 'escrow',
        name: 'Escrow.com',
        category: 'escrow',
        badge: 'Licensed Escrow Protection',
        headline: (domain) => `Transact ${domain} Safely with Escrow.com`,
        description: (domain) =>
            `The official escrow partner for high-value domain transactions. 100% fraud protection, verified wire verification, and zero chargebacks.`,
        ctaText: 'Start Secure Escrow Transaction →',
        affiliateUrl: 'https://www.escrow.com/?aff=YOUR_AFFILIATE_ID',
        icon: '🛡️',
        theme: 'indigo',
    },
    {
        id: 'hostinger',
        name: 'Hostinger Cloud',
        category: 'hosting',
        badge: 'High-Performance Web Infrastructure',
        headline: (domain) => `Deploy Ultra-Fast Cloud Hosting on ${domain}`,
        description: (domain) =>
            `Turn this domain into an active digital enterprise with ultra-fast NVMe cloud servers, free professional email, and automated SSL encryption.`,
        ctaText: 'Launch Site with 75% Off →',
        affiliateUrl: 'https://www.hostinger.com/?aff=YOUR_AFFILIATE_ID',
        icon: '🚀',
        theme: 'emerald',
    },
    {
        id: 'sedo',
        name: 'Sedo Marketplace',
        category: 'brokerage',
        badge: 'International Broker Network',
        headline: (domain) => `Expose ${domain} to European & Global Corporate Buyers`,
        description: (domain) =>
            `Direct syndication to over 2 million active investors and enterprise buyers worldwide with multilingual broker transaction management.`,
        ctaText: 'Promote Domain on Sedo →',
        affiliateUrl: 'https://sedo.com/?aff=YOUR_AFFILIATE_ID',
        icon: '🌍',
        theme: 'amber',
    },
];

/**
 * Returns a randomized affiliate partner from the master registry.
 * Can be seeded by a string (like the domain name + slot index) to ensure
 * consistency during SSR while rotating different partners across different slots.
 */
export function getAffiliatePartner(seedStr?: string, offset = 0): AffiliatePartner {
    if (!seedStr) {
        const randomIndex = Math.floor(Math.random() * AFFILIATE_PARTNERS.length);
        return AFFILIATE_PARTNERS[randomIndex]!;
    }

    let hash = 0;
    for (let i = 0; i < seedStr.length; i++) {
        hash = (hash << 5) - hash + seedStr.charCodeAt(i);
        hash |= 0;
    }
    const index = Math.abs(hash + offset) % AFFILIATE_PARTNERS.length;
    return AFFILIATE_PARTNERS[index]!;
}
