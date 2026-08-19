import './styles.css';
import { initAuth, resolveSession, requireSignIn, currentUserEmail } from './auth.js';
import { escapeHtml } from './escape-html.js';
import { icons } from './icons.js';

initAuth();

const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const signedOutSection = el<HTMLElement>('signed-out');
const loadingSection = el<HTMLElement>('loading');
const signedInSection = el<HTMLElement>('signed-in');
const planCard = el<HTMLElement>('plan-card');

const INCLUDED = [
    'Up to 10 websites, with unlimited on-demand audits',
    'The full 18-check deep audit, crawled across your site',
    'Automatic re-audit every week per verified site',
    'Embeddable trust badge and public verification page',
    'Certificate-style PDF report emailed after every audit',
    'One-click "Fix with PR" on a connected GitHub repo',
];

function render(): void {
    const email = currentUserEmail();
    planCard.innerHTML = `
        <div class="badge-pill badge-verified">${icons.check}Free plan — active</div>
        <h2 style="font-size:var(--t-xl);margin:14px 0 6px">Everything is included, at no cost.</h2>
        <p class="muted">AuditPulse is free to use. There's no billing to manage, no card on file, and no usage cap${email ? ` on <strong>${escapeHtml(email)}</strong>` : ''}.</p>
        <ul class="check-list" style="margin-top:18px">
            ${INCLUDED.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
        <p class="legal-note" style="margin-top:20px">Manage your email address, password, and connected sign-in methods from the account menu in the top-right.</p>`;
}

(async () => {
    const signedIn = await resolveSession();
    loadingSection.hidden = true;
    if (!signedIn) {
        signedOutSection.hidden = false;
        el<HTMLButtonElement>('signin').addEventListener('click', async () => {
            if (await requireSignIn()) window.location.reload();
        });
        return;
    }
    signedInSection.hidden = false;
    render();
})();
