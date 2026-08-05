import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';

type Rate = { headline: string; cpmCents: number; viewsRemaining: number };

/** Mirrors PUBLISHER_SHARE_PERCENT in api/_lib/pricing.ts. The board response
 *  carries the server's value, so this is only the pre-load placeholder. */
let sharePercent = 40;

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const boardRows = $('#board-rows');
const proofRate = $('#proof-rate');
const adForm = $<HTMLFormElement>('#ad-form');
const adStatus = $('#ad-status');
const pubForm = $<HTMLFormElement>('#pub-form');
const pubStatus = $('#pub-status');
const pubSnippet = $('#pub-snippet');
const pubEstimate = $('#pub-estimate');
const pubEstimateSide = $('#pub-estimate-side');
const cpmInput = $<HTMLInputElement>('#cpm-input');
const budgetInput = $<HTMLInputElement>('#budget-input');
const estimate = $('#views-estimate');
const estimateSide = $('#views-side');
const noticeBox = $('#notice');

const money = (cents: number): string =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

/* ---------------- the hero: a wait, on a loop ----------------
 * The product is a moment that is hard to describe and obvious to watch, so
 * the hero performs it rather than explaining it: a prompt lands, the model
 * thinks, the unit fills the gap that was already empty, the answer arrives
 * and clears it. Whatever is actually top of the board rides along, so the
 * demonstration is showing real inventory rather than a mock-up.
 */
const SCENES = [
    {
        host: 'a coding assistant',
        prompt: 'Refactor this module and explain what changed.',
        answer: 'Pulled the parsing out into its own function and added the missing null guard — three call sites simplified…',
    },
    {
        host: 'a research agent',
        prompt: 'Compare these four suppliers on lead time and MOQ.',
        answer: 'Two of the four publish lead times under 14 days. On minimum order quantity the gap is wider…',
    },
    {
        host: 'a chat app',
        prompt: 'Summarise this contract and flag anything unusual.',
        answer: 'The indemnity clause in section 9 is unusually broad, and the renewal term auto-extends unless…',
    },
];

const el = {
    host: $('#host-name'),
    prompt: $('#m-prompt'),
    think: $('#m-think'),
    clock: $('#m-clock'),
    ad: $('#m-ad'),
    adText: $('#m-ad-text'),
    adRate: $('#m-ad-rate'),
    meter: $('#m-meter'),
    answer: $('#m-answer'),
};

/** Top campaign on the board, so the hero advertises whatever is really live. */
let featured: { headline: string; cpmCents: number } | null = null;
let sceneIndex = 0;
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function runScene(): Promise<void> {
    if (!el.prompt || !el.think || !el.ad || !el.answer || !el.clock) return;
    const scene = SCENES[sceneIndex % SCENES.length];
    sceneIndex += 1;

    if (el.host) el.host.textContent = scene.host;
    el.prompt.textContent = scene.prompt;
    el.answer.classList.add('hide');
    el.answer.textContent = '';
    el.ad.classList.remove('in');
    el.think.style.visibility = 'visible';
    // Restart the meter fill; without the reflow the animation would not replay.
    if (el.meter) { el.meter.style.visibility = 'hidden'; void el.meter.offsetWidth; }

    await wait(700);

    // The unit appears in the gap while the model works.
    if (el.adText) el.adText.textContent = featured ? featured.headline : 'Your one line, right here.';
    if (el.adRate) {
        el.adRate.textContent = featured
            ? money(Math.round((featured.cpmCents * sharePercent) / 100))
            : `${sharePercent}%`;
    }
    if (el.meter) el.meter.style.visibility = 'visible';
    el.ad.classList.add('in');

    // A counting clock is the whole point — the inventory is measured in seconds.
    const startedAt = Date.now();
    const ticking = window.setInterval(() => {
        if (el.clock) el.clock.textContent = `${((Date.now() - startedAt) / 1000).toFixed(1)}s`;
    }, 100);

    await wait(3200);
    window.clearInterval(ticking);

    // Answer arrives; the gap closes and the ad goes with it.
    el.think.style.visibility = 'hidden';
    el.ad.classList.remove('in');
    if (el.meter) el.meter.style.visibility = 'hidden';
    el.answer.classList.remove('hide');

    for (let i = 1; i <= scene.answer.length; i += 2) {
        el.answer.textContent = scene.answer.slice(0, i);
        await wait(12);
    }

    await wait(2600);
}

async function loopHero(): Promise<void> {
    // Motion is the argument here, so with reduced-motion we show one resting
    // frame — the ad sitting in the gap — rather than an empty box.
    if (reduceMotion) {
        if (el.adText) el.adText.textContent = featured ? featured.headline : 'Your one line, right here.';
        el.ad?.classList.add('in');
        if (el.clock) el.clock.textContent = '4.2s';
        return;
    }
    for (;;) await runScene();
}

/* ---------------- live rates ---------------- */

function renderBoard(rates: Rate[]): void {
    if (!boardRows) return;

    if (!rates.length) {
        boardRows.innerHTML = `<p class="board-empty">No campaigns rotating yet — the first advertiser sets the opening rate. Anything from $1.00 to $100.00 per 1,000 views.</p>`;
        if (proofRate) proofRate.textContent = '—';
        if (pubEstimate) pubEstimate.textContent = '—';
        if (pubEstimateSide) pubEstimateSide.textContent = 'per 1,000 waits — no live rate yet';
        return;
    }

    boardRows.innerHTML = rates.map(rate => `<div class="board-row">
        <span class="board-pitch">${escapeHtml(rate.headline)}</span>
        <span class="board-rate num">${escapeHtml(money(rate.cpmCents))}</span>
        <span class="board-cut num">${escapeHtml(money(Math.round((rate.cpmCents * sharePercent) / 100)))}</span>
    </div>`).join('');

    // Top of the board, not an average: it is what an app stands to earn at best.
    const top = rates.reduce((best, r) => (r.cpmCents > best.cpmCents ? r : best), rates[0]);
    featured = { headline: top.headline, cpmCents: top.cpmCents };
    if (proofRate) proofRate.textContent = money(top.cpmCents);
    if (pubEstimate) pubEstimate.textContent = money(Math.round((top.cpmCents * sharePercent) / 100));
    if (pubEstimateSide) pubEstimateSide.textContent = `per 1,000 waits, at the current top rate of ${money(top.cpmCents)}`;
}

async function loadBoard(): Promise<void> {
    try {
        const response = await api.get<{ rates: Rate[]; sharePercent: number }>('/api/ads?view=board');
        if (typeof response.data.sharePercent === 'number') sharePercent = response.data.sharePercent;
        renderBoard(response.data.rates || []);
    } catch {
        if (boardRows) boardRows.innerHTML = `<p class="board-empty">The board is unreachable right now.</p>`;
    }
}

/* ---------------- advertiser ---------------- */

function updateEstimate(): void {
    if (!estimate || !cpmInput || !budgetInput) return;
    const cpm = Number(cpmInput.value);
    const budget = Number(budgetInput.value);

    if (!(cpm > 0) || !(budget > 0)) {
        estimate.textContent = '—';
        if (estimateSide) estimateSide.textContent = 'Enter a rate and a budget';
        return;
    }
    estimate.textContent = `${Math.floor((budget / cpm) * 1000).toLocaleString()} views`;
    if (estimateSide) estimateSide.textContent = `${money(Math.round(budget * 100 * sharePercent / 100))} goes to the apps`;
}

adForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!adForm.checkValidity()) { adForm.reportValidity(); return; }

    const button = adForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const raw = Object.fromEntries(new FormData(adForm).entries()) as Record<string, string>;
    const payload = {
        headline: raw.headline,
        url: raw.url,
        email: raw.email,
        cpmCents: Math.round(Number(cpmInput?.value) * 100),
        budgetCents: Math.round(Number(budgetInput?.value) * 100),
    };

    if (button) { button.disabled = true; button.textContent = 'Starting checkout…'; }
    try {
        const response = await api.post<{ checkoutUrl?: string }>('/api/ads?action=checkout', payload);
        if (response.data.checkoutUrl) {
            if (adStatus) { adStatus.textContent = 'Redirecting to secure checkout…'; adStatus.className = 'form-status ok'; }
            window.location.assign(response.data.checkoutUrl);
            return;
        }
        if (adStatus) { adStatus.textContent = 'Checkout could not be started. Try again.'; adStatus.className = 'form-status bad'; }
    } catch (err) {
        if (adStatus) {
            adStatus.textContent = err instanceof ApiError ? err.message : 'Could not start checkout. Try again.';
            adStatus.className = 'form-status bad';
        }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Continue to payment →'; }
    }
});

cpmInput?.addEventListener('input', updateEstimate);
budgetInput?.addEventListener('input', updateEstimate);

/* ---------------- publisher ---------------- */

pubForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!pubForm.checkValidity()) { pubForm.reportValidity(); return; }

    const button = pubForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(pubForm).entries());

    if (button) { button.disabled = true; button.textContent = 'Creating your key…'; }
    try {
        const response = await api.post<{ slotKey: string }>('/api/publishers', payload);
        if (pubStatus) {
            pubStatus.textContent = 'Key created. It starts earning once we have checked the app.';
            pubStatus.className = 'form-status ok';
        }
        if (pubSnippet) {
            // Shown rather than emailed — the whole pitch is that nothing here
            // is hidden from the app running the unit.
            pubSnippet.classList.remove('ph');
            pubSnippet.textContent = `<div id="sikads"></div>
<script src="${window.location.origin}/embed.js" data-slot="${response.data.slotKey}"><\/script>`;
        }
    } catch (err) {
        if (pubStatus) {
            pubStatus.textContent = err instanceof ApiError ? err.message : 'Could not create your key. Try again.';
            pubStatus.className = 'form-status bad';
        }
    } finally {
        if (button) { button.disabled = false; button.textContent = 'Get my slot key →'; }
    }
});

/* ---------------- returning from Stripe ---------------- */

const NOTICES: Record<'success' | 'cancelled', { tone: 'success' | 'neutral'; title: string; body: string }> = {
    success: {
        tone: 'success',
        title: 'Payment received.',
        body: 'Your campaign is in the review queue — it joins the board as soon as it is approved.',
    },
    cancelled: {
        tone: 'neutral',
        title: 'Checkout cancelled.',
        body: 'You were not charged and nothing went live. The form is still here if you want another go.',
    },
};

function showNotice(): void {
    if (!noticeBox) return;

    // Matched against the two known keys rather than indexing straight into
    // NOTICES, so a hand-edited ?ad=anything can't render a half-empty banner.
    const key = new URLSearchParams(window.location.search).get('ad');
    if (key !== 'success' && key !== 'cancelled') return;
    const notice = NOTICES[key];

    noticeBox.innerHTML = `<div class="notice notice-${notice.tone}">
        <p><strong>${notice.title}</strong> ${notice.body}</p>
        <button type="button" class="notice-close" aria-label="Dismiss">&times;</button>
    </div>`;
    noticeBox.querySelector('.notice-close')?.addEventListener('click', () => { noticeBox.innerHTML = ''; });

    // Drop the parameter so a refresh — or a link pasted to a friend — doesn't
    // replay "payment received" for someone who never bought anything.
    const url = new URL(window.location.href);
    url.searchParams.delete('ad');
    window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

showNotice();
updateEstimate();
loadBoard();
loopHero();
