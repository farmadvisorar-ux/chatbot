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

function fallbackCardBadge(message: string): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="175" viewBox="0 0 380 175">
  <rect width="380" height="175" rx="14" fill="#0f172a" stroke="#334155" stroke-width="1.5"/>
  <rect x="18" y="16" width="68" height="20" rx="4" fill="#2563eb"/>
  <text x="52" y="30" fill="#ffffff" font-family="system-ui,sans-serif" font-size="10" font-weight="800" text-anchor="middle">DOMAINIQ</text>
  <text x="190" y="95" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="13" text-anchor="middle">${escapeXml(message)}</text>
  <text x="362" y="156" fill="#64748b" font-family="system-ui,sans-serif" font-size="10" text-anchor="end">domainiq.com</text>
</svg>`;
}

function renderCardBadge(
    domain: string,
    midUsd: number,
    lowUsd: number,
    highUsd: number,
    confidenceScore: number,
    floorUsd: number,
): string {
    const domainFontSize = domain.length > 24 ? 14 : domain.length > 18 ? 16 : 18;
    const formattedFmv = formatUsd(midUsd);
    const formattedRange = `${formatUsd(lowUsd)}–${formatUsd(highUsd)}`;
    const formattedFloor = formatUsd(floorUsd);
    const confColor = confidenceScore >= 75 ? '#34d399' : confidenceScore >= 50 ? '#fbbf24' : '#94a3b8';
    const confBg = confidenceScore >= 75 ? '#064e3b' : confidenceScore >= 50 ? '#451a03' : '#1e293b';
    const confBorder = confidenceScore >= 75 ? '#059669' : confidenceScore >= 50 ? '#d97706' : '#475569';

    return `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="175" viewBox="0 0 380 175" role="img" aria-label="${escapeXml(domain)} Valuation: ${escapeXml(formattedFmv)}">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#1e293b"/>
    </linearGradient>
    <linearGradient id="valGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
  </defs>

  <!-- Background Card -->
  <rect width="380" height="175" rx="14" fill="url(#bgGrad)" stroke="#334155" stroke-width="1.5"/>

  <!-- Top Brand Row -->
  <g transform="translate(18, 16)">
    <!-- Brand Pill -->
    <rect width="68" height="20" rx="4" fill="#2563eb"/>
    <text x="34" y="14" fill="#ffffff" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="800" text-anchor="middle" letter-spacing="0.5">DOMAINIQ</text>
    
    <text x="76" y="14" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" letter-spacing="0.5">VERIFIED APPRAISAL</text>
    
    <!-- Confidence Pill -->
    <rect x="272" y="0" width="72" height="20" rx="10" fill="${confBg}" stroke="${confBorder}" stroke-width="1"/>
    <text x="308" y="14" fill="${confColor}" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="700" text-anchor="middle">${confidenceScore}% CONF</text>
  </g>

  <!-- Domain Name -->
  <text x="18" y="66" fill="#f8fafc" font-family="system-ui,-apple-system,sans-serif" font-size="${domainFontSize}" font-weight="700">${escapeXml(domain)}</text>

  <!-- Fair Market Value -->
  <text x="18" y="104" fill="url(#valGrad)" font-family="system-ui,-apple-system,sans-serif" font-size="28" font-weight="800">${escapeXml(formattedFmv)}</text>
  
  <text x="18" y="123" fill="#94a3b8" font-family="system-ui,-apple-system,sans-serif" font-size="11" font-weight="500">EST. RANGE: ${escapeXml(formattedRange)}</text>

  <!-- Divider Line -->
  <line x1="18" y1="138" x2="362" y2="138" stroke="#334155" stroke-width="1"/>

  <!-- Footer Row -->
  <g transform="translate(18, 156)">
    <text x="0" y="0" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="500">
      Liquidation Floor: <tspan fill="#cbd5e1" font-weight="700">${escapeXml(formattedFloor)}</tspan>
    </text>
    <text x="344" y="0" fill="#64748b" font-family="system-ui,-apple-system,sans-serif" font-size="10" font-weight="600" text-anchor="end">domainiq.com</text>
  </g>
</svg>`;
}

export async function GET(req: NextRequest, { params }: { params: { domain: string } }) {
    const raw = decodeURIComponent(params.domain).replace(/\.svg$/i, '');
    const { searchParams } = new URL(req.url);
    const isCard = searchParams.get('style') === 'card';

    const svgHeaders = {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=43200, stale-while-revalidate=86400',
    };

    if (!isValidDomain(raw)) {
        return new NextResponse(
            isCard ? fallbackCardBadge('Invalid domain name') : fallbackBadge('invalid domain'),
            { headers: svgHeaders, status: 400 },
        );
    }
    const domain = normalizeDomain(raw);

    try {
        let midUsd: number | undefined;
        let lowUsd: number | undefined;
        let highUsd: number | undefined;
        let confidenceScore = 80;
        let floorUsd = 0;

        if (process.env.DATABASE_URL) {
            try {
                const { rows } = await getPool().query<{
                    mid_usd: number;
                    low_usd: number;
                    high_usd: number;
                    confidence: string;
                    breakdown_json: any;
                }>(
                    `SELECT mid_usd, low_usd, high_usd, confidence, breakdown_json FROM valuations WHERE domain = $1 AND created_at > now() - interval '30 days' ORDER BY created_at DESC LIMIT 1`,
                    [domain],
                );

                if (rows[0]) {
                    midUsd = rows[0].mid_usd;
                    lowUsd = rows[0].low_usd;
                    highUsd = rows[0].high_usd;
                    const parsed = typeof rows[0].breakdown_json === 'string'
                        ? JSON.parse(rows[0].breakdown_json)
                        : rows[0].breakdown_json;
                    confidenceScore = parsed?.confidenceScore ?? (rows[0].confidence === 'high' ? 88 : rows[0].confidence === 'medium' ? 68 : 45);
                    floorUsd = parsed?.channelPricing?.liquidationFloor ?? Math.round(lowUsd * 0.45);
                }
            } catch {
                // Ignore DB cache lookup failure and fall through
            }
        }

        if (midUsd === undefined || lowUsd === undefined || highUsd === undefined) {
            const result = await evaluateDomain(domain, { lookupAge: false, checkTrademark: false });
            midUsd = result.midUsd;
            lowUsd = result.lowUsd;
            highUsd = result.highUsd;
            confidenceScore = result.confidenceScore;
            floorUsd = result.channelPricing.liquidationFloor;
        }

        if (isCard) {
            return new NextResponse(
                renderCardBadge(domain, midUsd, lowUsd, highUsd, confidenceScore, floorUsd),
                { headers: svgHeaders, status: 200 },
            );
        }

        const priceLabel = `${formatUsd(lowUsd)}–${formatUsd(highUsd)}`;
        return new NextResponse(renderBadge(domain, priceLabel), { headers: svgHeaders, status: 200 });
    } catch {
        return new NextResponse(
            isCard ? fallbackCardBadge(`${domain}: unavailable`) : fallbackBadge(`${domain}: unavailable`),
            { headers: svgHeaders, status: 500 },
        );
    }
}
