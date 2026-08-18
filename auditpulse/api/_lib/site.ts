/** Public origin of this deployment, used to build absolute links in emails, PDFs, and the trust badge. */
export function siteOrigin(): string {
    return process.env.PUBLIC_SITE_URL || 'https://auditpulse-ten.vercel.app';
}
