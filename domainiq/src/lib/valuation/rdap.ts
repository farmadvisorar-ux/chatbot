export interface RdapResult {
    registered: boolean;
    ageYears: number | null;
    registrationDate: string | null;
}

/**
 * Best-effort domain age lookup via the public RDAP bootstrap service.
 * Older domains carry an SEO/trust premium, but this signal is optional:
 * if the network call fails, times out, or the registry doesn't answer,
 * we simply omit the age factor rather than fail the whole valuation.
 */
export async function lookupDomainAge(domain: string, timeoutMs = 4000): Promise<RdapResult | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(`https://rdap.org/domain/${encodeURIComponent(domain)}`, {
            signal: controller.signal,
            headers: { Accept: 'application/rdap+json' },
        });
        if (res.status === 404) {
            return { registered: false, ageYears: null, registrationDate: null };
        }
        if (!res.ok) return null;

        const data = (await res.json()) as { events?: { eventAction: string; eventDate: string }[] };
        const registration = data.events?.find((e) => e.eventAction === 'registration');
        if (!registration) return { registered: true, ageYears: null, registrationDate: null };

        const regDate = new Date(registration.eventDate);
        const ageYears = (Date.now() - regDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
        return { registered: true, ageYears: Math.max(0, ageYears), registrationDate: registration.eventDate };
    } catch {
        return null;
    } finally {
        clearTimeout(timer);
    }
}
