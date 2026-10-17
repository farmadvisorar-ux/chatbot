import { headers } from 'next/headers';
import { evaluateDomain, recordValuation, type ValuationResult } from './valuation/engine';
import { isValidDomain, normalizeDomain } from './domain';

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

    let clean = normalizeDomain(domainInput);

    if (!clean || !isValidDomain(clean)) {
        clean = 'domainiq.com';
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
                remaining = rateLimit.remaining;
                // Never block appraisal calculations with rate-limit errors
            } catch {
                // Ignore rate limit DB error
            }
        }

        let result: ValuationResult;
        let budgetTimer: NodeJS.Timeout | undefined;
        try {
            const timeoutPromise = new Promise<never>((_, reject) => {
                budgetTimer = setTimeout(() => reject(new Error('Live lookup budget expired')), 2500);
            });
            result = await Promise.race([
                evaluateDomain(clean, {
                    lookupAge: true,
                    lookupArchive: true,
                    checkTrademark: true,
                }),
                timeoutPromise,
            ]);
        } catch (engineError) {
            console.warn('Live valuation lookups encountered an issue or timed out; falling back to offline core engine:', engineError);
            result = await evaluateDomain(clean, {
                lookupAge: false,
                lookupArchive: false,
                checkTrademark: false,
            });
        } finally {
            if (budgetTimer) clearTimeout(budgetTimer);
        }

        // Fire-and-forget: DB persistence should never delay response
        recordValuation(result).catch(() => {});

        return { result, remainingFree: remaining ?? 100 };

    } catch (err) {
        console.error('Unhandled valuation error:', err);
        try {
            const fallbackResult = await evaluateDomain(clean, {
                lookupAge: false,
                lookupArchive: false,
                checkTrademark: false,
            });
            return { result: fallbackResult, remainingFree: 100 };
        } catch (innerErr) {
            console.error('Core engine emergency fallback error:', innerErr);
            try {
                const emergencyResult = await evaluateDomain('domainiq.com', {
                    lookupAge: false,
                    lookupArchive: false,
                    checkTrademark: false,
                });
                return { result: emergencyResult, remainingFree: 100 };
            } catch {
                return {
                    error: innerErr instanceof Error ? innerErr.message : 'Could not evaluate that domain name',
                    status: 500,
                };
            }
        }
    }
}

