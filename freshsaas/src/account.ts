import './account.css';
import { escapeHtml } from './escape-html';
import { initAuth, requireSignIn, getAuthToken, resolveSession } from './auth';

type Submission = { product: string; url: string; promise: string; status: string; submittedAt: string; directoryStatus: string | null; featured: boolean | null };
type SellerListing = { id: string; name: string; tagline: string; priceCents: number; status: string; createdAt: string; sales: number };
type Purchase = { id: string; listingName: string; url: string; priceCents: number; paymentState: string; createdAt: string; releasedAt: string | null };
type Account = {
    profile: { email: string; name: string | null };
    payouts: { connected: boolean; enabled: boolean };
    submissions: Submission[];
    listings: SellerListing[];
    purchases: Purchase[];
};

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector<T>(sel)!;
const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const day = (value: string): string => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Plain-English state for a buyer, rather than the internal payment_state. */
function purchaseState(state: string, releasedAt: string | null): string {
    if (state === 'released') return `Complete — seller paid ${releasedAt ? day(releasedAt) : ''}`;
    if (state === 'paid_held') return 'Paid — held by FreshSAAS until you confirm handover';
    return state;
}

function listingState(status: string): string {
    if (status === 'live') return 'Live in the marketplace';
    if (status === 'pending_review') return 'Awaiting review';
    if (status === 'rejected') return 'Not accepted';
    return status;
}

async function api<T>(path: string): Promise<T> {
    const token = await getAuthToken();
    const response = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error((payload as { error?: string } | null)?.error || `Request failed (${response.status})`);
    return payload as T;
}

function render(data: Account): void {
    $('#greeting').textContent = data.profile.name ? `Hello, ${data.profile.name}` : 'Your account';

    // Only nudge about payouts once they actually have something to sell.
    const payoutCard = $('#payout-card');
    if (data.listings.length) {
        payoutCard.hidden = false;
        if (data.payouts.enabled) {
            $('#payout-title').textContent = 'Payouts are active';
            $('#payout-copy').textContent = 'Your Stripe account is ready to receive money from sales.';
            $<HTMLButtonElement>('#payout-button').textContent = 'Manage on Stripe';
        } else if (data.payouts.connected) {
            $('#payout-title').textContent = 'Finish your payout setup';
            $('#payout-copy').textContent = 'Stripe still needs a few details before buyers can purchase your listings.';
        }
    }

    $('#listings').innerHTML = data.listings.length ? data.listings.map(item => `
      <article class="item">
        <h3>${escapeHtml(item.name)}</h3>
        <p class="muted">${escapeHtml(item.tagline)}</p>
        <p class="meta"><strong>${escapeHtml(money(item.priceCents))}</strong> · ${escapeHtml(listingState(item.status))} · listed ${escapeHtml(day(item.createdAt))}${item.sales ? ` · ${item.sales} sale${item.sales === 1 ? '' : 's'}` : ''}</p>
      </article>`).join('') : '<div class="empty">You haven\'t listed anything for sale yet.</div>';

    $('#submissions').innerHTML = data.submissions.length ? data.submissions.map(item => `
      <article class="item">
        <h3>${escapeHtml(item.product)}</h3>
        <p class="muted">${escapeHtml(item.promise)}</p>
        <p class="meta">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(item.url)}</a>
          · ${item.directoryStatus === 'live' ? 'Live in the directory' : item.directoryStatus === 'rejected' ? 'Removed from the directory' : 'Submitted'}
          ${item.featured ? ' · <span class="badge">Featured</span>' : ''}
          · ${escapeHtml(day(item.submittedAt))}
        </p>
      </article>`).join('') : '<div class="empty">You haven\'t submitted a product yet.</div>';

    $('#purchases').innerHTML = data.purchases.length ? data.purchases.map(item => `
      <article class="item">
        <h3>${escapeHtml(item.listingName)}</h3>
        <p class="meta"><strong>${escapeHtml(money(item.priceCents))}</strong> · ${escapeHtml(purchaseState(item.paymentState, item.releasedAt))} · ${escapeHtml(day(item.createdAt))}</p>
        ${item.paymentState === 'paid_held' ? '<p class="note">Your payment is held until the handover is confirmed. Contact us once you have received everything.</p>' : ''}
      </article>`).join('') : '<div class="empty">No purchases yet.</div>';
}

async function load(): Promise<void> {
    try {
        const data = await api<Account>('/api/seller/payouts?view=account');
        render(data);
        $('#loading').hidden = true;
        $('#signed-in').hidden = false;
    } catch (err) {
        $('#loading').hidden = true;
        $('#status').textContent = err instanceof Error ? err.message : 'Could not load your account.';
        $('#status').className = 'status error';
        $('#signed-in').hidden = false;
    }
}

$<HTMLButtonElement>('#payout-button').addEventListener('click', async event => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    try {
        const token = await getAuthToken();
        const response = await fetch('/api/seller/payouts', { method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const payload = await response.json();
        if (payload.url) window.location.assign(payload.url);
        else throw new Error(payload.error || 'Could not open payout setup.');
    } catch (err) {
        $('#status').textContent = err instanceof Error ? err.message : 'Could not open payout setup.';
        $('#status').className = 'status error';
        button.disabled = false;
    }
});

$('#signin').addEventListener('click', () => { void requireSignIn().then(ok => { if (ok) load(); }); });

(async () => {
    initAuth();
    // This page is meaningless without a session, so resolve one up front
    // rather than waiting for a sign-in click as the public site does.
    if (await resolveSession()) {
        await load();
        return;
    }
    $('#loading').hidden = true;
    $('#signed-out').hidden = false;
})();
