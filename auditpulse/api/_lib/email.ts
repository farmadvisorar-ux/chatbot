import { Resend } from 'resend';
import { escapeHtml } from '../../src/escape-html.js';
import { siteOrigin } from './site.js';

// Must be an address on a domain verified in Resend -> Domains, or delivery fails.
const SENDER = 'AuditPulse <reports@brokehealth.com>';
const REPLY_TO = 'farmadvisorar@gmail.com';

export type SeveritySummary = { critical: number; high: number; medium: number; low: number; info: number };

export interface ReportEmailFinding {
    title: string;
    severity: keyof SeveritySummary;
    impact: string;
    description: string;
    remediation: string;
}

export function severityColor(severity: string): string {
    switch (severity) {
        case 'critical': return '#e0245e';
        case 'high': return '#ff6b4a';
        case 'medium': return '#f5a623';
        case 'low': return '#4a90d9';
        default: return '#8a94a6';
    }
}

/** No-ops if RESEND_API_KEY isn't configured. Never throws — callers log failure themselves via the returned boolean. */
export async function sendWelcomeEmail(toEmail: string, name: string | null): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return;
    const greeting = name ? `Hi ${name},` : 'Hi there,';
    try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
            from: SENDER,
            to: toEmail,
            replyTo: REPLY_TO,
            subject: 'Welcome to AuditPulse',
            text: `${greeting}\n\nWelcome to AuditPulse. Add a website to start auditing it for security vulnerabilities and misconfigurations. Add up to 10 sites; every verified site is re-audited automatically once a week, with the report emailed to you.\n\nQuestions? Just reply to this email.\n\n— AuditPulse`,
        });
        if (error) console.error('Welcome email was not sent:', error.name, error.message);
    } catch (err) {
        console.error('Welcome email threw:', err);
    }
}

/**
 * Sends a formatted vulnerability report to a recipient the caller (an
 * authenticated AuditPulse user) explicitly typed in — this is a
 * transactional message on their behalf, not unsolicited outreach.
 * Includes a link to the interactive report (report.html?token=...) so the
 * recipient can drill into every finding without needing an account.
 */
export async function sendReportEmail(params: {
    toEmail: string;
    note?: string;
    targetLabel: string;
    targetUrl: string;
    grade: string;
    score: number;
    summary: SeveritySummary;
    topFindings: ReportEmailFinding[];
    shareToken: string;
    senderName: string | null;
    /** Full audit-certificate PDF (cover page + every finding) attached as durable proof of the audit — separate from the top-8 findings shown inline in the email body. */
    pdfBuffer?: Buffer;
}): Promise<{ ok: boolean; error?: string }> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) return { ok: false, error: 'Email sending is not configured on this deployment.' };

    const reportUrl = `${siteOrigin()}/report.html?token=${encodeURIComponent(params.shareToken)}`;
    const totalFindings = Object.values(params.summary).reduce((a, b) => a + b, 0);

    const rows = params.topFindings.map(f => `
        <tr>
            <td style="padding:8px 10px;border-bottom:1px solid #22283a;">
                <span style="display:inline-block;background:${severityColor(f.severity)};color:#fff;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:700;text-transform:uppercase;">${escapeHtml(f.severity)}</span>
            </td>
            <td style="padding:8px 10px;border-bottom:1px solid #22283a;">
                <strong>${escapeHtml(f.title)}</strong><br/>
                <span style="color:#c9d1e0;font-size:13px;">${escapeHtml(f.impact)}</span>
            </td>
        </tr>`).join('');

    const html = `
    <div style="font-family:'DM Sans',Arial,sans-serif;background:#0b0e14;color:#e8ecf4;padding:32px 16px;">
      <div style="max-width:640px;margin:0 auto;background:#141922;border:1px solid #22283a;border-radius:16px;overflow:hidden;">
        <div style="padding:24px 28px;border-bottom:1px solid #22283a;">
          <div style="font-weight:800;font-size:18px;letter-spacing:-0.02em;">AuditPulse</div>
          <div style="color:#93a0b5;font-size:13px;margin-top:2px;">Vulnerability audit report</div>
        </div>
        <div style="padding:24px 28px;">
          ${params.note ? `<p style="color:#c9d1e0;">${escapeHtml(params.note)}</p>` : ''}
          <p>Security audit for <strong>${escapeHtml(params.targetLabel)}</strong> (${escapeHtml(params.targetUrl)}) is complete.</p>
          <div style="display:flex;gap:16px;align-items:center;margin:20px 0;">
            <div style="font-size:36px;font-weight:800;color:#c9ff57;">${escapeHtml(params.grade)}</div>
            <div style="color:#93a0b5;font-size:13px;">Security score: ${params.score}/100<br/>${totalFindings} finding(s): ${params.summary.critical} critical, ${params.summary.high} high, ${params.summary.medium} medium, ${params.summary.low} low, ${params.summary.info} informational</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}</table>
          <p style="margin-top:24px;">
            <a href="${reportUrl}" style="display:inline-block;background:#c9ff57;color:#0b0e14;font-weight:800;padding:12px 20px;border-radius:10px;text-decoration:none;">View full interactive report →</a>
          </p>
          <p style="color:#6b7385;font-size:12px;margin-top:28px;">Sent by ${escapeHtml(params.senderName || 'an AuditPulse user')} via AuditPulse. This scan only performed passive, non-intrusive checks against the target.</p>
        </div>
      </div>
    </div>`;

    const text = `AuditPulse security audit for ${params.targetLabel} (${params.targetUrl})\n\n` +
        `Grade: ${params.grade} (score ${params.score}/100)\n` +
        `${totalFindings} finding(s): ${params.summary.critical} critical, ${params.summary.high} high, ${params.summary.medium} medium, ${params.summary.low} low, ${params.summary.info} info\n\n` +
        params.topFindings.map(f => `[${f.severity.toUpperCase()}] ${f.title}\n${f.impact}\nFix: ${f.remediation}\n`).join('\n') +
        `\nFull interactive report: ${reportUrl}\n`;

    try {
        const resend = new Resend(apiKey);
        const { error } = await resend.emails.send({
            from: SENDER,
            to: params.toEmail,
            replyTo: REPLY_TO,
            subject: `Security audit report: ${params.targetLabel} — grade ${params.grade}`,
            html,
            text,
            attachments: params.pdfBuffer
                ? [{ filename: `auditpulse-report-${params.targetLabel.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`, content: params.pdfBuffer, contentType: 'application/pdf' }]
                : undefined,
        });
        if (error) return { ok: false, error: error.message };
        return { ok: true };
    } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Unknown error' };
    }
}
