import { getPool } from './db';

export interface AdminUser {
    id: number;
    email: string;
    plan: string;
    email_verified_at: string | null;
    created_at: string;
    watchlistCount?: number;
    valuationsCount?: number;
}

export interface AdSlotData {
    id: number; // 1, 2, 3, 4
    name: string;
    title: string;
    description: string;
    image_url?: string | null;
    destination_url: string;
    cta_text: string;
    sponsor_name: string;
    badge: string;
    is_active: boolean;
    impressions: number;
    clicks: number;
    updated_at: string;
}

export interface AdPurchaseData {
    id: number;
    slot_id: number;
    advertiser_name: string;
    company: string;
    email: string;
    amount_usd: number;
    status: 'active' | 'pending' | 'expired' | 'canceled';
    start_date: string;
    expiry_date: string | null;
    destination_url: string;
    notes?: string | null;
    created_at: string;
}

export interface AdminStats {
    totalUsers: number;
    verifiedUsers: number;
    proUsers: number;
    todaySignups: number;
    activeSlotsCount: number;
    totalAdRevenue: number;
    totalAdImpressions: number;
    totalAdClicks: number;
    averageCtr: string;
}

// Default 4 High-Converting Ad Slots
const DEFAULT_AD_SLOTS: AdSlotData[] = [
    {
        id: 1,
        name: 'Box 1: Top Hero / Header Billboard',
        title: 'Apex Escrow: Zero-Chargeback Domain Transactions',
        description: 'Licensed wire escrow & instant automated domain push across 85+ global registrars. Protect high-value deals.',
        image_url: 'https://images.unsplash.com/photo-1559526324-4b87b5e36e44?auto=format&fit=crop&w=400&q=80',
        destination_url: 'https://www.escrow.com/?utm_source=domainiq&utm_medium=ad_box_1',
        cta_text: 'Secure Transaction →',
        sponsor_name: 'Apex Escrow Services',
        badge: 'Premier Sponsor',
        is_active: true,
        impressions: 4820,
        clicks: 341,
        updated_at: new Date().toISOString(),
    },
    {
        id: 2,
        name: 'Box 2: Valuation Report Showcase',
        title: 'Dan.com: 300% Higher Conversions with Lease-To-Own',
        description: 'Offer buyers frictionless 12 to 36 month installment checkout on custom domain landers. Keep full ownership until paid.',
        image_url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=400&q=80',
        destination_url: 'https://dan.com/?utm_source=domainiq&utm_medium=ad_box_2',
        cta_text: 'Create Landers Free →',
        sponsor_name: 'Dan Marketplace Network',
        badge: 'Featured Showcase',
        is_active: true,
        impressions: 3915,
        clicks: 298,
        updated_at: new Date().toISOString(),
    },
    {
        id: 3,
        name: 'Box 3: Intelligence & Calculator Tile',
        title: 'Namecheap: Low Renewal Rates & Free WHOIS Guard',
        description: 'The preferred domainer registrar for .ai, .com, and portfolio drops. Advanced DNS management & zero markups.',
        image_url: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=400&q=80',
        destination_url: 'https://www.namecheap.com/?utm_source=domainiq&utm_medium=ad_box_3',
        cta_text: 'Transfer & Register →',
        sponsor_name: 'Namecheap Domains',
        badge: 'Recommended Registrar',
        is_active: true,
        impressions: 2740,
        clicks: 184,
        updated_at: new Date().toISOString(),
    },
    {
        id: 4,
        name: 'Box 4: Site-Wide Footer Leaderboard',
        title: 'Hostinger Cloud: Deploy Ultra-Fast NVMe Web Assets',
        description: 'Transform acquired domains into thriving digital businesses. 99.9% uptime, free email, and automated SSL certs.',
        image_url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=400&q=80',
        destination_url: 'https://www.hostinger.com/?utm_source=domainiq&utm_medium=ad_box_4',
        cta_text: 'Get 75% Off Cloud →',
        sponsor_name: 'Hostinger Cloud Infrastructure',
        badge: 'Official Cloud Partner',
        is_active: true,
        impressions: 5120,
        clicks: 312,
        updated_at: new Date().toISOString(),
    },
];

// Initial seed buyers/purchases so admin has sample tracking immediately
const DEFAULT_PURCHASES: AdPurchaseData[] = [
    {
        id: 1,
        slot_id: 1,
        advertiser_name: 'David Vance',
        company: 'Apex Escrow Services LLC',
        email: 'dvance@apexescrow.com',
        amount_usd: 1450.0,
        status: 'active',
        start_date: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: new Date(Date.now() + 16 * 24 * 60 * 60 * 1000).toISOString(),
        destination_url: 'https://www.escrow.com/?utm_source=domainiq&utm_medium=ad_box_1',
        notes: 'Monthly sponsorship banner on Header Billboard. Paid via Stripe wire.',
        created_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 2,
        slot_id: 2,
        advertiser_name: 'Elena Rostova',
        company: 'Dan Marketplace Network',
        email: 'partners@dan-domains.com',
        amount_usd: 1200.0,
        status: 'active',
        start_date: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
        destination_url: 'https://dan.com/?utm_source=domainiq&utm_medium=ad_box_2',
        notes: 'Mid-report valuation spotlight integration.',
        created_at: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 3,
        slot_id: 3,
        advertiser_name: 'Marcus Brody',
        company: 'Venture Registrars Corp',
        email: 'sponsor@venturereg.io',
        amount_usd: 850.0,
        status: 'active',
        start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        expiry_date: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
        destination_url: 'https://www.namecheap.com/?utm_source=domainiq&utm_medium=ad_box_3',
        notes: 'Intelligence tile placement across calculator and SEO pillar pages.',
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
    },
    {
        id: 4,
        slot_id: 4,
        advertiser_name: 'Sarah Jenkins',
        company: 'CloudHost Enterprise',
        email: 'sarah@cloudhostglobal.net',
        amount_usd: 650.0,
        status: 'pending',
        start_date: new Date().toISOString(),
        expiry_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        destination_url: 'https://www.hostinger.com/?utm_source=domainiq&utm_medium=ad_box_4',
        notes: 'Inquiry submitted for next month footer slot. Pending confirmation.',
        created_at: new Date().toISOString(),
    },
];

// Fallback users for sandboxed/offline environments
const MOCK_USERS: AdminUser[] = [
    {
        id: 101,
        email: 'founder@domainventure.com',
        plan: 'enterprise',
        email_verified_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
        watchlistCount: 14,
        valuationsCount: 185,
    },
    {
        id: 102,
        email: 'alex.investor@capitaldom.io',
        plan: 'pro',
        email_verified_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        watchlistCount: 8,
        valuationsCount: 64,
    },
    {
        id: 103,
        email: 'sarah.flipping@gmail.com',
        plan: 'free',
        email_verified_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        watchlistCount: 3,
        valuationsCount: 19,
    },
    {
        id: 104,
        email: 'broker@sedopartner.net',
        plan: 'pro',
        email_verified_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
        watchlistCount: 22,
        valuationsCount: 112,
    },
    {
        id: 105,
        email: 'newuser.today@startup.ai',
        plan: 'free',
        email_verified_at: null,
        created_at: new Date().toISOString(),
        watchlistCount: 1,
        valuationsCount: 4,
    },
];

// In-Memory state for live updates if DB is unconfigured or offline
declare global {
    // eslint-disable-next-line no-var
    var __domainiqAdSlots: AdSlotData[] | undefined;
    // eslint-disable-next-line no-var
    var __domainiqPurchases: AdPurchaseData[] | undefined;
    // eslint-disable-next-line no-var
    var __domainiqMockUsers: AdminUser[] | undefined;
}

function getMemorySlots(): AdSlotData[] {
    if (!globalThis.__domainiqAdSlots) {
        globalThis.__domainiqAdSlots = JSON.parse(JSON.stringify(DEFAULT_AD_SLOTS));
    }
    return globalThis.__domainiqAdSlots!;
}

function getMemoryPurchases(): AdPurchaseData[] {
    if (!globalThis.__domainiqPurchases) {
        globalThis.__domainiqPurchases = JSON.parse(JSON.stringify(DEFAULT_PURCHASES));
    }
    return globalThis.__domainiqPurchases!;
}

function getMemoryUsers(): AdminUser[] {
    if (!globalThis.__domainiqMockUsers) {
        globalThis.__domainiqMockUsers = JSON.parse(JSON.stringify(MOCK_USERS));
    }
    return globalThis.__domainiqMockUsers!;
}

/**
 * Ensure database tables exist if Postgres is connected
 */
async function ensureTables(): Promise<void> {
    if (!process.env.DATABASE_URL) return;
    try {
        const pool = getPool();
        await pool.query(`
            CREATE TABLE IF NOT EXISTS ad_slots (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                image_url TEXT,
                destination_url TEXT NOT NULL,
                cta_text TEXT NOT NULL DEFAULT 'Learn More →',
                sponsor_name TEXT NOT NULL DEFAULT 'DomainIQ Partner',
                badge TEXT NOT NULL DEFAULT 'Featured Sponsor',
                is_active BOOLEAN NOT NULL DEFAULT true,
                impressions INTEGER NOT NULL DEFAULT 0,
                clicks INTEGER NOT NULL DEFAULT 0,
                updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );

            CREATE TABLE IF NOT EXISTS ad_purchases (
                id SERIAL PRIMARY KEY,
                slot_id INTEGER NOT NULL,
                advertiser_name TEXT NOT NULL,
                company TEXT NOT NULL,
                email TEXT NOT NULL,
                amount_usd DOUBLE PRECISION NOT NULL DEFAULT 0,
                status TEXT NOT NULL,
                start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
                expiry_date TIMESTAMPTZ,
                destination_url TEXT NOT NULL,
                notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
        `);

        // Check if ad_slots has initial 4 records
        const { rows } = await pool.query('SELECT count(*) FROM ad_slots');
        if (Number(rows[0]?.count ?? 0) === 0) {
            for (const slot of DEFAULT_AD_SLOTS) {
                await pool.query(
                    `INSERT INTO ad_slots (id, name, title, description, image_url, destination_url, cta_text, sponsor_name, badge, is_active, impressions, clicks)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
                    [
                        slot.id,
                        slot.name,
                        slot.title,
                        slot.description,
                        slot.image_url,
                        slot.destination_url,
                        slot.cta_text,
                        slot.sponsor_name,
                        slot.badge,
                        slot.is_active,
                        slot.impressions,
                        slot.clicks,
                    ],
                );
            }
        }
    } catch {
        // Fall back to in-memory state
    }
}

/**
 * Fetch all registered users
 */
export async function getAdminUsers(): Promise<AdminUser[]> {
    if (process.env.DATABASE_URL) {
        try {
            await ensureTables();
            const pool = getPool();
            const { rows } = await pool.query<AdminUser>(`
                SELECT 
                    u.id, 
                    u.email, 
                    u.plan, 
                    u.email_verified_at, 
                    u.created_at,
                    COALESCE(w.cnt, 0)::int as "watchlistCount",
                    COALESCE(v.cnt, 0)::int as "valuationsCount"
                FROM users u
                LEFT JOIN (SELECT user_id, count(*) as cnt FROM watchlist GROUP BY user_id) w ON w.user_id = u.id
                LEFT JOIN (SELECT count(*) as cnt FROM valuations) v ON true
                ORDER BY u.created_at DESC
            `);
            if (rows && rows.length > 0) return rows;
        } catch {
            // Ignore DB error, fall back to memory
        }
    }
    return getMemoryUsers();
}

/**
 * Update user plan or verification
 */
export async function updateAdminUser(userId: number, updates: { plan?: string; verified?: boolean }): Promise<boolean> {
    if (process.env.DATABASE_URL) {
        try {
            const pool = getPool();
            if (updates.plan) {
                await pool.query('UPDATE users SET plan = $1 WHERE id = $2', [updates.plan, userId]);
            }
            if (updates.verified !== undefined) {
                await pool.query('UPDATE users SET email_verified_at = $1 WHERE id = $2', [
                    updates.verified ? new Date() : null,
                    userId,
                ]);
            }
            return true;
        } catch {
            // Fall back to memory
        }
    }

    const users = getMemoryUsers();
    const target = users.find((u) => u.id === userId);
    if (target) {
        if (updates.plan) target.plan = updates.plan;
        if (updates.verified !== undefined) target.email_verified_at = updates.verified ? new Date().toISOString() : null;
        return true;
    }
    return false;
}

/**
 * Fetch the 4 Advertisement Boxes
 */
export async function getAdSlots(): Promise<AdSlotData[]> {
    if (process.env.DATABASE_URL) {
        try {
            await ensureTables();
            const pool = getPool();
            const { rows } = await pool.query<AdSlotData>('SELECT * FROM ad_slots ORDER BY id ASC');
            if (rows && rows.length === 4) return rows;
        } catch {
            // Fall back to memory
        }
    }
    return getMemorySlots();
}

/**
 * Fetch a single Ad Slot by ID (1, 2, 3, or 4)
 */
export async function getAdSlotById(slotId: number): Promise<AdSlotData | null> {
    const slots = await getAdSlots();
    return slots.find((s) => s.id === slotId) ?? null;
}

/**
 * Push Live / Update an Ad Box configuration
 */
export async function updateAdSlot(slotId: number, data: Partial<AdSlotData>): Promise<AdSlotData> {
    const memorySlots = getMemorySlots();
    const memIndex = memorySlots.findIndex((s) => s.id === slotId);
    if (memIndex !== -1) {
        memorySlots[memIndex] = {
            ...memorySlots[memIndex]!,
            ...data,
            id: slotId,
            updated_at: new Date().toISOString(),
        };
    }

    if (process.env.DATABASE_URL) {
        try {
            await ensureTables();
            const pool = getPool();
            const current = memorySlots[memIndex]!;
            await pool.query(
                `INSERT INTO ad_slots (id, name, title, description, image_url, destination_url, cta_text, sponsor_name, badge, is_active, updated_at)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
                 ON CONFLICT (id) DO UPDATE SET
                    title = EXCLUDED.title,
                    description = EXCLUDED.description,
                    image_url = EXCLUDED.image_url,
                    destination_url = EXCLUDED.destination_url,
                    cta_text = EXCLUDED.cta_text,
                    sponsor_name = EXCLUDED.sponsor_name,
                    badge = EXCLUDED.badge,
                    is_active = EXCLUDED.is_active,
                    updated_at = now()`,
                [
                    slotId,
                    current.name,
                    current.title,
                    current.description,
                    current.image_url ?? null,
                    current.destination_url,
                    current.cta_text,
                    current.sponsor_name,
                    current.badge,
                    current.is_active,
                ],
            );
        } catch {
            // Fall back to memory
        }
    }

    return memorySlots[memIndex] ?? DEFAULT_AD_SLOTS[0]!;
}

/**
 * Record an ad click and return the target destination URL
 */
export async function recordAdClick(slotId: number): Promise<string> {
    const memorySlots = getMemorySlots();
    const target = memorySlots.find((s) => s.id === slotId);
    if (target) {
        target.clicks += 1;
    }

    if (process.env.DATABASE_URL) {
        try {
            const pool = getPool();
            await pool.query('UPDATE ad_slots SET clicks = clicks + 1 WHERE id = $1', [slotId]);
        } catch {
            // Memory counter already incremented
        }
    }

    return target?.destination_url ?? 'https://domainiq.app';
}

/**
 * Record an ad view / impression
 */
export async function recordAdImpression(slotId: number): Promise<void> {
    const memorySlots = getMemorySlots();
    const target = memorySlots.find((s) => s.id === slotId);
    if (target) {
        target.impressions += 1;
    }

    if (process.env.DATABASE_URL) {
        try {
            const pool = getPool();
            await pool.query('UPDATE ad_slots SET impressions = impressions + 1 WHERE id = $1', [slotId]);
        } catch {
            // Memory counter incremented
        }
    }
}

/**
 * Fetch all ad space purchase orders and advertisers
 */
export async function getAdPurchases(): Promise<AdPurchaseData[]> {
    if (process.env.DATABASE_URL) {
        try {
            await ensureTables();
            const pool = getPool();
            const { rows } = await pool.query<AdPurchaseData>('SELECT * FROM ad_purchases ORDER BY created_at DESC');
            if (rows && rows.length > 0) return rows;
        } catch {
            // Fall back to memory
        }
    }
    return getMemoryPurchases();
}

/**
 * Create a new ad purchase record or sponsor inquiry
 */
export async function createAdPurchase(data: Omit<AdPurchaseData, 'id' | 'created_at'>): Promise<AdPurchaseData> {
    const memoryPurchases = getMemoryPurchases();
    const newId = memoryPurchases.length > 0 ? Math.max(...memoryPurchases.map((p) => p.id)) + 1 : 1;
    const record: AdPurchaseData = {
        ...data,
        id: newId,
        created_at: new Date().toISOString(),
    };
    memoryPurchases.unshift(record);

    if (process.env.DATABASE_URL) {
        try {
            await ensureTables();
            const pool = getPool();
            const { rows } = await pool.query<AdPurchaseData>(
                `INSERT INTO ad_purchases (slot_id, advertiser_name, company, email, amount_usd, status, start_date, expiry_date, destination_url, notes)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                 RETURNING *`,
                [
                    data.slot_id,
                    data.advertiser_name,
                    data.company,
                    data.email,
                    data.amount_usd,
                    data.status,
                    data.start_date,
                    data.expiry_date,
                    data.destination_url,
                    data.notes ?? null,
                ],
            );
            if (rows[0]) return rows[0];
        } catch {
            // Fall back to memory
        }
    }

    return record;
}

/**
 * Update an existing ad purchase
 */
export async function updateAdPurchase(id: number, data: Partial<AdPurchaseData>): Promise<boolean> {
    const memoryPurchases = getMemoryPurchases();
    const index = memoryPurchases.findIndex((p) => p.id === id);
    if (index !== -1) {
        memoryPurchases[index] = { ...memoryPurchases[index]!, ...data };
    }

    if (process.env.DATABASE_URL) {
        try {
            const pool = getPool();
            const fields: string[] = [];
            const values: (string | number | null)[] = [];
            let i = 1;

            if (data.status !== undefined) {
                fields.push(`status = $${i++}`);
                values.push(data.status);
            }
            if (data.amount_usd !== undefined) {
                fields.push(`amount_usd = $${i++}`);
                values.push(data.amount_usd);
            }
            if (data.destination_url !== undefined) {
                fields.push(`destination_url = $${i++}`);
                values.push(data.destination_url);
            }
            if (data.notes !== undefined) {
                fields.push(`notes = $${i++}`);
                values.push(data.notes);
            }

            if (fields.length > 0) {
                values.push(id);
                await pool.query(`UPDATE ad_purchases SET ${fields.join(', ')} WHERE id = $${i}`, values);
            }
            return true;
        } catch {
            // Fall back to memory
        }
    }

    return index !== -1;
}

/**
 * Delete an ad purchase
 */
export async function deleteAdPurchase(id: number): Promise<boolean> {
    const memoryPurchases = getMemoryPurchases();
    const index = memoryPurchases.findIndex((p) => p.id === id);
    if (index !== -1) {
        memoryPurchases.splice(index, 1);
    }

    if (process.env.DATABASE_URL) {
        try {
            const pool = getPool();
            await pool.query('DELETE FROM ad_purchases WHERE id = $1', [id]);
            return true;
        } catch {
            // Fall back to memory
        }
    }

    return index !== -1;
}

/**
 * Aggregate summary KPIs for the admin dashboard
 */
export async function getAdminStats(): Promise<AdminStats> {
    const [users, slots, purchases] = await Promise.all([getAdminUsers(), getAdSlots(), getAdPurchases()]);

    const totalUsers = users.length;
    const verifiedUsers = users.filter((u) => Boolean(u.email_verified_at)).length;
    const proUsers = users.filter((u) => u.plan === 'pro' || u.plan === 'enterprise').length;

    const todayDate = new Date().toISOString().split('T')[0];
    const todaySignups = users.filter((u) => u.created_at.startsWith(todayDate!)).length;

    const activeSlotsCount = slots.filter((s) => s.is_active).length;
    const totalAdRevenue = purchases
        .filter((p) => p.status === 'active' || p.status === 'paid' as string)
        .reduce((sum, p) => sum + (p.amount_usd || 0), 0);

    const totalAdImpressions = slots.reduce((sum, s) => sum + s.impressions, 0);
    const totalAdClicks = slots.reduce((sum, s) => sum + s.clicks, 0);
    const ctr = totalAdImpressions > 0 ? ((totalAdClicks / totalAdImpressions) * 100).toFixed(2) + '%' : '0.00%';

    return {
        totalUsers,
        verifiedUsers,
        proUsers,
        todaySignups,
        activeSlotsCount,
        totalAdRevenue,
        totalAdImpressions,
        totalAdClicks,
        averageCtr: ctr,
    };
}

/**
 * Real-time Live Link Push to GET payload.
 * Provides instant machine-readable feeds for external systems/webhooks.
 */
export async function getLivePushFeed(): Promise<{
    timestamp: string;
    stats: AdminStats;
    recentUsers: AdminUser[];
    activeAdBoxes: AdSlotData[];
    adOrders: AdPurchaseData[];
}> {
    const [stats, users, slots, purchases] = await Promise.all([
        getAdminStats(),
        getAdminUsers(),
        getAdSlots(),
        getAdPurchases(),
    ]);

    return {
        timestamp: new Date().toISOString(),
        stats,
        recentUsers: users.slice(0, 20),
        activeAdBoxes: slots,
        adOrders: purchases,
    };
}

/**
 * Live Link Push Trigger: sends real-time payload to any configured external webhook URL
 */
export async function triggerWebhookPush(webhookUrl: string): Promise<{ success: boolean; status?: number; error?: string }> {
    try {
        const feed = await getLivePushFeed();
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'User-Agent': 'DomainIQ-Admin-Webhook/1.0' },
            body: JSON.stringify({
                event: 'domainiq.live_sync',
                pushedAt: new Date().toISOString(),
                data: feed,
            }),
        });

        return {
            success: response.ok,
            status: response.status,
            error: response.ok ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        };
    } catch (err) {
        return {
            success: false,
            error: err instanceof Error ? err.message : 'Failed to reach webhook URL',
        };
    }
}
