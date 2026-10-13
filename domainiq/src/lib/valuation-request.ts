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
    const trimmed = (domainInput || '').trim().toLowerCase();
    if (!isValidDomain(trimmed)) {
        return { error: `"${domainInput}" doesn't look like a valid domain name`, status: 400 };
    }

    try {
        let session = null;
        try {
            session = await getSession();
        } catch {
            session = null;
        }

        let remaining: number | null = null;
        if (!session) {
            let ip = 'unknown';
            try {
                ip = getClientIp(headers());
            } catch {
                // headers() may fail in edge/standalone scenarios
            }

            try {
                const rateLimit = await checkAndConsumeRateLimit(ip);
                if (!rateLimit.allowed) {
                    return { error: 'Free anonymous limit reached for today. Sign up (free) for unlimited valuations.', status: 429 };
                }
                remaining = rateLimit.remaining;
            } catch {
                // Ignore rate limit DB error
            }
        }

        let result: ValuationResult;
        try {
            result = await evaluateDomain(trimmed, {
                lookupAge: true,
                lookupArchive: true,
                checkTrademark: true,
            });
        } catch (engineError) {
            console.warn('Live valuation lookups encountered an issue; falling back to offline core engine:', engineError);
            result = await evaluateDomain(trimmed, {
                lookupAge: false,
                lookupArchive: false,
                checkTrademark: false,
            });
        }

        try {
            await recordValuation(result);
        } catch {
            // DB persistence failure should never block response
        }

        return { result, remainingFree: remaining };
    } catch (err) {
        console.error('Unhandled valuation error:', err);
        try {
            const fallbackResult = await evaluateDomain(trimmed, {
                lookupAge: false,
                lookupArchive: false,
                checkTrademark: false,
            });
            return { result: fallbackResult, remainingFree: 10 };
        } catch (innerErr) {
            return {
                error: innerErr instanceof Error ? innerErr.message : 'Could not evaluate that domain name',
                status: 500,
            };
        }
    }
}
