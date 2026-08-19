import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';

type Rate = { headline: string; cpmCents: number; viewsRemaining: number };

/** Mirrors PUBLISHER_SHARE_PERCENT in api/_lib/pricing.ts. The board response
 *  carries the server's value, so this is only the pre-load placeholder. */
let sharePercent = 40;

const $ = <T extends HTMLElement>(sel: string): T | null => document.querySelector<T>(sel);

const boardRows = $('#board-rows');
const proofRate = $('#proof-rate');
const proofWait = $('#proof-wait');
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

/* ---------------- the latency trace ----------------
 * The chat panel shows a person waiting; this shows the same wait as the
 * machine reports it. Drawn on a canvas rather than assembled from SVG paths
 * because it is a continuously updating signal, not a fixed illustration.
 *
 * `thinking` is driven by the chat loop below, so the two are the same event
 * seen twice — the trace lifts exactly when the sponsored line appears.
 */
let thinking = false;
let waitStartedAt = 0;
let peakSeconds = 0;

function startTrace(): void {
    const canvas = $<HTMLCanvasElement>('#trace');
    const stateLabel = $('#trace-state');
    const peakLabel = $('#trace-peak');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const styles = getComputedStyle(document.documentElement);
    const colour = (name: string, fallback: string): string =>
        styles.getPropertyValue(name).trim() || fallback;

    // Samples are a ring of recent amplitudes; the canvas redraws all of them
    // each frame, which is cheap at this width and avoids scroll artefacts.
    const samples: number[] = [];
    let width = 0;
    let height = 0;

    const resize = (): void => {
        const ratio = Math.min(window.devicePixelRatio || 1, 2);
        width = canvas.clientWidth;
        height = canvas.clientHeight;
        canvas.width = Math.max(1, Math.round(width * ratio));
        canvas.height = Math.max(1, Math.round(height * ratio));
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    let phase = 0;

    const frame = (): void => {
        phase += 1;

        // Idle is a low, slow ripple; thinking is a taller, busier signal that
        // decays as the wait goes on — the shape of work finishing.
        const elapsed = thinking ? (Date.now() - waitStartedAt) / 1000 : 0;
        const envelope = thinking ? Math.max(0.25, 1 - elapsed / 6) : 0.12;
        const noise = thinking ? Math.sin(phase / 3) * 0.35 + Math.sin(phase / 7.3) * 0.3 : 0;
        const base = Math.sin(phase / 22) * 0.5 + Math.sin(phase / 9.1) * 0.2;
        samples.push((base + noise) * envelope);

        const maxSamples = Math.max(60, Math.floor(width / 2));
        while (samples.length > maxSamples) samples.shift();

        ctx.clearRect(0, 0, width, height);
        const mid = height / 2;

        // Baseline
        ctx.strokeStyle = colour('--edge', 'rgba(255,255,255,.09)');
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, mid);
        ctx.lineTo(width, mid);
        ctx.stroke();

        const line = thinking ? colour('--pulse', '#6f8dff') : colour('--dim', '#6f7a92');
        const step = samples.length > 1 ? width / (samples.length - 1) : width;

        // Filled area under the trace, then the trace itself on top.
        ctx.beginPath();
        ctx.moveTo(0, mid);
        samples.forEach((value, i) => ctx.lineTo(i * step, mid - value * (height * 0.42)));
        ctx.lineTo(width, mid);
        ctx.closePath();
        // globalAlpha rather than a color-mix() fill: canvas support for
        // colour functions is uneven, and a fill that silently fails to parse
        // paints solid black over the panel.
        ctx.globalAlpha = 0.16;
        ctx.fillStyle = line;
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.beginPath();
        samples.forEach((value, i) => {
            const x = i * step;
            const y = mid - value * (height * 0.42);
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        });
        ctx.strokeStyle = line;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        // The leading edge, so the eye has somewhere to sit.
        if (samples.length) {
            const y = mid - samples[samples.length - 1] * (height * 0.42);
            ctx.beginPath();
            ctx.arc(width - 1, y, thinking ? 3 : 2, 0, Math.PI * 2);
            ctx.fillStyle = line;
            ctx.fill();
        }

        if (thinking) {
            peakSeconds = Math.max(peakSeconds, elapsed);
            if (proofWait) proofWait.textContent = `${elapsed.toFixed(1)}s`;
        }
        if (stateLabel) stateLabel.textContent = thinking ? 'thinking' : 'idle';
        if (peakLabel) peakLabel.textContent = `${peakSeconds.toFixed(1)}s`;

        requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
}

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
    // Drives the latency trace, so both views show the same moment.
    thinking = true;
    waitStartedAt = Date.now();
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
    thinking = false;
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

function renderBoard(rates: Rate[], configured = true): void {
    if (!boardRows) return;

    if (!configured) {
        boardRows.innerHTML = `<p class="board-empty">The exchange is not configured on this deployment yet — no database is connected.</p>`;
        if (proofRate) proofRate.textContent = '—';
        if (pubEstimate) pubEstimate.textContent = '—';
        if (pubEstimateSide) pubEstimateSide.textContent = 'per 1,000 waits — exchange offline';
        return;
    }

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
        const response = await api.get<{ rates: Rate[]; sharePercent: number; configured?: boolean }>('/api/ads?view=board');
        if (typeof response.data.sharePercent === 'number') sharePercent = response.data.sharePercent;
        renderBoard(response.data.rates || [], response.data.configured !== false);
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
    let redirecting = false;
    try {
        const response = await api.post<{ checkoutUrl?: string }>('/api/ads?action=checkout', payload);
        if (response.data.checkoutUrl) {
            if (adStatus) { adStatus.textContent = 'Redirecting to secure checkout…'; adStatus.className = 'form-status ok'; }
            redirecting = true;
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
        // Keep the button disabled once navigation has started — re-enabling
        // it lets a second click open another Checkout session (and another
        // awaiting_payment campaign) before the browser leaves the page.
        if (button && !redirecting) { button.disabled = false; button.textContent = 'Continue to payment →'; }
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
        const response = await api.post<{ slotKey: string; status?: string }>('/api/publishers', payload);
        if (pubStatus) {
            const status = response.data.status;
            pubStatus.textContent = status === 'active'
                ? 'Welcome back — your key is already approved and earning.'
                : status === 'rejected'
                    ? 'Key recovered. This app was rejected before; it is back in the review queue.'
                    : 'Key created. It starts earning once we have checked the app.';
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
if (!reduceMotion) startTrace();
loopHero();
