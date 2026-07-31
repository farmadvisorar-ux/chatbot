function escapeXml(value: string): string {
    return value.replace(/[<>&'"]/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[char] as string));
}

function gradeColor(grade: string): string {
    if (grade.startsWith('A')) return '#35e0a1';
    if (grade.startsWith('B')) return '#a3e035';
    if (grade.startsWith('C')) return '#ffcc4d';
    return '#ff4d6d';
}

const WIDTH = 168;
const HEIGHT = 58;
const FONT = "Arial, Helvetica, sans-serif";

/**
 * Renders the embeddable trust seal as a self-contained SVG (no external
 * fonts/images — <img>-embedded SVGs on third-party sites can't load
 * cross-origin resources anyway). Two states: a verified site with a
 * completed scan shows its grade; anything else shows a neutral "pending"
 * badge so an early embed doesn't render a broken image or a false claim.
 */
export function renderBadgeSvg(params: { verified: boolean; grade: string | null; dateLabel: string | null }): string {
    if (!params.verified || !params.grade) {
        return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <title>AuditPulse — not yet verified</title>
    <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="#0b0e14" stroke="#3a4256"/>
    <text x="14" y="24" font-family="${FONT}" font-size="12" font-weight="bold" fill="#ffffff">AuditPulse</text>
    <text x="14" y="40" font-family="${FONT}" font-size="10" fill="#93a0b5">Verification pending</text>
</svg>`;
    }

    const color = gradeColor(params.grade);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
    <title>AuditPulse — audited, grade ${escapeXml(params.grade)}${params.dateLabel ? `, last checked ${escapeXml(params.dateLabel)}` : ''}</title>
    <rect x="0.5" y="0.5" width="${WIDTH - 1}" height="${HEIGHT - 1}" rx="10" fill="#0b0e14" stroke="${color}" stroke-opacity="0.6"/>
    <circle cx="16" cy="18" r="6" fill="none" stroke="${color}" stroke-width="1.6"/>
    <path d="M13 18l2 2.2 4-4.6" stroke="${color}" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <text x="27" y="22" font-family="${FONT}" font-size="12" font-weight="bold" fill="#ffffff">AuditPulse</text>
    <text x="14" y="38" font-family="${FONT}" font-size="9" letter-spacing="1" fill="#93a0b5">SECURITY AUDITED</text>
    <rect x="${WIDTH - 38}" y="10" width="24" height="24" rx="6" fill="${color}" fill-opacity="0.15" stroke="${color}"/>
    <text x="${WIDTH - 26}" y="27" font-family="${FONT}" font-size="13" font-weight="bold" fill="${color}" text-anchor="middle">${escapeXml(params.grade)}</text>
    ${params.dateLabel ? `<text x="14" y="50" font-family="${FONT}" font-size="8" fill="#6b7385">Checked ${escapeXml(params.dateLabel)}</text>` : ''}
</svg>`;
}
