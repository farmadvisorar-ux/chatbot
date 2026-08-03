export interface TldInfo {
    /** 0-100: how much market authority/trust this extension carries. */
    authority: number;
    /** Price multiplier relative to the equivalent .com (which is 1.0). */
    multiplier: number;
    label: string;
}

const DEFAULT_TLD: TldInfo = { authority: 20, multiplier: 0.04, label: 'Other extension' };

export const TLD_TABLE: Record<string, TldInfo> = {
    com: { authority: 100, multiplier: 1.0, label: 'The default global extension' },
    net: { authority: 68, multiplier: 0.16, label: 'Legacy alternative, still widely trusted' },
    org: { authority: 66, multiplier: 0.14, label: 'Associated with non-profits and institutions' },
    io: { authority: 78, multiplier: 0.4, label: 'Popular with tech/startup brands' },
    ai: { authority: 80, multiplier: 0.5, label: 'High demand from AI-sector branding' },
    co: { authority: 62, multiplier: 0.22, label: '".com" alternative, popular with startups' },
    dev: { authority: 58, multiplier: 0.15, label: 'Developer-focused, Google-run registry' },
    app: { authority: 58, multiplier: 0.15, label: 'App/product branding, requires HTTPS' },
    xyz: { authority: 35, multiplier: 0.05, label: 'Cheap, high-volume new gTLD' },
    online: { authority: 32, multiplier: 0.04, label: 'Budget new gTLD' },
    site: { authority: 32, multiplier: 0.04, label: 'Budget new gTLD' },
    tech: { authority: 45, multiplier: 0.08, label: 'Niche tech-branding gTLD' },
    store: { authority: 42, multiplier: 0.08, label: 'E-commerce focused gTLD' },
    shop: { authority: 42, multiplier: 0.08, label: 'E-commerce focused gTLD' },
    info: { authority: 40, multiplier: 0.05, label: 'Older informational gTLD, low trust today' },
    biz: { authority: 38, multiplier: 0.05, label: 'Business-oriented, low adoption' },
    me: { authority: 50, multiplier: 0.1, label: 'Personal branding ccTLD (Montenegro)' },
    tv: { authority: 48, multiplier: 0.12, label: 'Media/streaming branding ccTLD (Tuvalu)' },
    club: { authority: 34, multiplier: 0.04, label: 'Community-oriented new gTLD' },
    live: { authority: 34, multiplier: 0.04, label: 'Streaming/events new gTLD' },
    world: { authority: 34, multiplier: 0.04, label: 'New gTLD' },
    finance: { authority: 40, multiplier: 0.06, label: 'Financial services gTLD' },
    crypto: { authority: 45, multiplier: 0.1, label: 'Web3/crypto branding gTLD' },
    gg: { authority: 46, multiplier: 0.12, label: 'Gaming/esports ccTLD (Guernsey)' },
    so: { authority: 40, multiplier: 0.08, label: 'Short ccTLD (Somalia), used for wordplay' },
    us: { authority: 50, multiplier: 0.09, label: 'United States ccTLD' },
    uk: { authority: 55, multiplier: 0.12, label: 'United Kingdom ccTLD' },
    'co.uk': { authority: 60, multiplier: 0.16, label: 'United Kingdom commercial ccTLD' },
    de: { authority: 62, multiplier: 0.16, label: 'Germany ccTLD, large domestic market' },
    ca: { authority: 55, multiplier: 0.11, label: 'Canada ccTLD' },
    au: { authority: 52, multiplier: 0.1, label: 'Australia ccTLD' },
    'com.au': { authority: 58, multiplier: 0.14, label: 'Australia commercial ccTLD' },
    in: { authority: 48, multiplier: 0.08, label: 'India ccTLD' },
    eu: { authority: 45, multiplier: 0.07, label: 'European Union regional TLD' },
    nl: { authority: 50, multiplier: 0.09, label: 'Netherlands ccTLD' },
    fr: { authority: 48, multiplier: 0.08, label: 'France ccTLD' },
    jp: { authority: 50, multiplier: 0.09, label: 'Japan ccTLD' },
    br: { authority: 45, multiplier: 0.07, label: 'Brazil ccTLD' },
    es: { authority: 46, multiplier: 0.07, label: 'Spain ccTLD' },
    it: { authority: 46, multiplier: 0.07, label: 'Italy ccTLD' },
    nyc: { authority: 40, multiplier: 0.06, label: 'New York City regional gTLD' },
    ly: { authority: 38, multiplier: 0.06, label: 'Short ccTLD (Libya), used for wordplay' },
    to: { authority: 36, multiplier: 0.05, label: 'Short ccTLD (Tonga), used for wordplay' },
    fm: { authority: 38, multiplier: 0.06, label: 'Radio/media ccTLD (Micronesia)' },
    im: { authority: 36, multiplier: 0.05, label: 'Messaging-adjacent ccTLD (Isle of Man)' },
    cc: { authority: 40, multiplier: 0.06, label: 'Alternative short extension' },
    name: { authority: 30, multiplier: 0.03, label: 'Personal-name gTLD, low commercial demand' },
    mobi: { authority: 26, multiplier: 0.03, label: 'Legacy mobile-web gTLD, low demand today' },
};

export function getTldInfo(tld: string): TldInfo {
    return TLD_TABLE[tld.toLowerCase()] ?? DEFAULT_TLD;
}
