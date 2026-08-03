import { headers } from 'next/headers';
import { evaluateDomain, recordValuation, type ValuationResult } from './valuation/engine';
import { isValidDomain } from './domain';
import { checkAndConsumeRateLimit, getClientIp } from './rate-limit';
import { getSession } from './auth';

export interface ValuationRequestResult {
    result?: ValuationResult;
    remainingFree?: number | null;
    error?: string;
    status?: number;
}

/**
 * Shared entry point used by both the JSON API route and server-rendered
 * pages, so anonymous rate limiting applies no matter how a valuation is
 * requested (direct page visit, search-engine landing, or API call).
 */
export async function performValuation(domainInput: string): Promise<ValuationRequestResult> {
    if (!isValidDomain(domainInput)) {
        return { error: `"${domainInput}" doesn't look like a valid domain name`, status: 400 };
    }

    const session = await getSession();
    if (!session) {
        const ip = getClientIp(headers());
        const { allowed, remaining } = await checkAndConsumeRateLimit(ip);
        if (!allowed) {
            return { error: 'Free anonymous limit reached for today. Sign up (free) for unlimited valuations.', status: 429 };
        }
        const result = await evaluateDomain(domainInput, { lookupAge: true });
        await recordValuation(result);
        return { result, remainingFree: remaining };
    }

    const result = await evaluateDomain(domainInput, { lookupAge: true });
    await recordValuation(result);
    return { result, remainingFree: null };
}
