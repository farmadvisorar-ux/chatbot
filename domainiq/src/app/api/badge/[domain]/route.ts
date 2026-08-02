import { NextRequest, NextResponse } from 'next/server';
import { getPool } from '@/lib/db';
import { evaluateDomain } from '@/lib/valuation/engine';
import { isValidDomain, normalizeDomain } from '@/lib/domain';
import { formatUsd } from '@/lib/format';

function escapeXml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function charWidth(s: string): number {
    return Math.round(s.length * 6.6) + 20;
}

function renderBadge(domain: string, priceLabel: string): string {
    const leftLabel = 'DomainIQ';
    const rightLabel = `${domain}  ${priceLabel}`;
    const leftWidth = charWidth(leftLabel) + 6;
    const rightWidth = charWidth(rightLabel) + 6;
    const totalWidth = leftWidth + rightWidth;
    const height = 24;

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${height}" viewBox="0 0 ${totalWidth} ${height}" role="img" aria-label="${escapeXml(leftLabel)}: ${escapeXml(rightLabel)}">
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#fff" stop-opacity=".05"/>
    <stop offset="1" stop-opacity=".05"/>
  </linearGradient>
  <clipPath id="r"><rect width="${totalWidth}" height="${height}" rx="4" fill="#fff"/></clipPath>
  <g clip-path="url(#r)">
    <rect width="${leftWidth}" height="${height}" fill="#1b3fe0"/>
    <rect x="${leftWidth}" width="${rightWidth}" height="${height}" fill="#f8fafc"/>
    <rect width="${totalWidth}" height="${height}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="12" font-weight="600">
    <text x="${leftWidth / 2}" y="${height / 2 + 4}">${escapeXml(leftLabel)}</text>
  </g>
  <g fill="#0f172a" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="12" font-weight="500">
    <text x="${leftWidth + rightWidth / 2}" y="${height / 2 + 4}">${escapeXml(rightLabel)}</text>
  </g>
</svg>`;
}

function fallbackBadge(message: string): string {
    const width = charWidth(message) + 40;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="24" viewBox="0 0 ${width} 24">
  <rect width="${width}" height="24" rx="4" fill="#94a3b8"/>
  <text x="${width / 2}" y="16" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="12">${escapeXml(message)}</text>
</svg>`;
}

export async function GET(_req: NextRequest, { params }: { params: { domain: string } }) {
    const raw = decodeURIComponent(params.domain).replace(/\.svg$/i, '');
    const svgHeaders = {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=43200, stale-while-revalidate=86400',
    };

    if (!isValidDomain(raw)) {
        return new NextResponse(fallbackBadge('invalid domain'), { headers: svgHeaders, status: 400 });
    }
    const domain = normalizeDomain(raw);

    try {
        // Prefer a recently-cached valuation over recomputing on every hit —
        // this endpoint is meant to be embedded and can get hit repeatedly
        // by page crawlers, so avoid a live compute (and any DB write) per
        // request where possible.
        const { rows } = await getPool().query<{ mid_usd: number; low_usd: number; high_usd: number }>(
            `SELECT mid_usd, low_usd, high_usd FROM valuations WHERE domain = $1 AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 1`,
            [domain],
        );

        let lowUsd: number;
        let highUsd: number;
        if (rows[0]) {
            lowUsd = rows[0].low_usd;
            highUsd = rows[0].high_usd;
        } else {
            const result = await evaluateDomain(domain, { lookupAge: false, checkTrademark: false });
            lowUsd = result.lowUsd;
            highUsd = result.highUsd;
        }

        const priceLabel = `${formatUsd(lowUsd)}–${formatUsd(highUsd)}`;
        return new NextResponse(renderBadge(domain, priceLabel), { headers: svgHeaders });
    } catch {
        return new NextResponse(fallbackBadge(`${domain}: unavailable`), { headers: svgHeaders, status: 500 });
    }
}
