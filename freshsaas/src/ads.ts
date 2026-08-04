import { createIcons, Megaphone, Plus, X, ArrowRight } from 'lucide';
import { api, ApiError } from './api-client';
import { escapeHtml } from './escape-html';
import { track } from './analytics';

type Ad = { id: string; headline: string; url: string };

const PACKAGES: Array<{ value: string; label: string }> = [
    { value: '1000', label: '1,000 views — $9' },
    { value: '5000', label: '5,000 views — $39' },
    { value: '20000', label: '20,000 views — $129' },
];

const styleText = `
.ads-rail{padding:80px 0;background:var(--paper)}
.ads-rail .section-wrap{max-width:1180px}
.ads-head{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:28px;flex-wrap:wrap}
.ads-badge{display:inline-flex;align-items:center;gap:8px;background:rgba(16,19,27,.06);border:1px solid var(--line);color:#4f564b;border-radius:999px;padding:8px 14px;font-size:12px;font-weight:800;letter-spacing:.04em;margin-bottom:10px}
.ads-badge svg{width:15px}
.ads-head h2{font-family:'Syne',sans-serif;font-size:clamp(28px,3.4vw,40px);letter-spacing:-.05em;margin:0 0 8px}
.ads-head p{color:#6b7266;max-width:520px;line-height:1.6;margin:0}
.ads-buy-button{background:var(--ink);color:#fff;border:0;border-radius:12px;padding:12px 18px;font-weight:800;cursor:pointer;display:inline-flex;align-items:center;gap:8px;white-space:nowrap}
.ads-list{display:grid;gap:10px}
.ads-item{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid var(--line);border-radius:14px;padding:14px 16px;text-decoration:none;color:var(--ink);transition:transform .18s ease,border-color .18s ease}
.ads-item:hover{transform:translateY(-2px);border-color:rgba(16,19,27,.3)}
.ads-item-tag{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#7d8477;background:rgba(16,19,27,.06);border-radius:999px;padding:5px 9px;flex-shrink:0}
.ads-item-text{flex:1;font-weight:600;font-size:14px}
.ads-item svg{width:16px;flex-shrink:0;color:#7d8477}
.ads-empty{grid-column:1/-1;padding:32px;text-align:center;border:1px dashed var(--line);border-radius:16px;color:#6d7469}
.ads-modal{position:fixed;inset:0;display:grid;place-items:center;z-index:95;opacity:0;visibility:hidden;transition:.2s ease}
.ads-modal.open{opacity:1;visibility:visible}
.ads-modal-backdrop{position:absolute;inset:0;background:rgba(8,10,14,.72);backdrop-filter:blur(8px)}
.ads-modal-card{position:relative;z-index:1;width:min(460px,calc(100% - 28px));max-height:88vh;overflow:auto;background:#fff;color:var(--ink);border-radius:22px;padding:30px}
.ads-modal-card h2{font-family:'Syne',sans-serif;font-size:26px;margin:6px 0 18px;letter-spacing:-.04em}
.ads-modal-close{position:absolute;top:16px;right:16px;width:38px;height:38px;border-radius:11px;border:1px solid var(--line);background:#fff;display:grid;place-items:center;cursor:pointer}
.ads-modal-card label{display:block;font-size:13px;font-weight:700;margin-bottom:12px;color:#454b40}
.ads-modal-card input[type="text"],.ads-modal-card input[type="url"],.ads-modal-card input[type="email"]{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:10px;padding:11px 12px;font:inherit}
.ads-packages{display:grid;gap:8px;margin-top:6px}
.ads-package{display:flex;align-items:center;gap:9px;font-weight:600;font-size:13px;margin-bottom:0;border:1px solid var(--line);border-radius:10px;padding:10px 12px;cursor:pointer}
.ads-package input{margin:0}
.ads-note{font-size:12px;color:#7d8477;margin:-4px 0 16px}
.ads-modal-card button[type="submit"]{width:100%;background:var(--ink);color:#fff;border:0;border-radius:12px;padding:14px;font-weight:800;cursor:pointer;margin-top:6px}
@media(max-width:680px){.ads-rail{padding:56px 0}}
`;

export function mountAds(): void {
    const anchor = document.querySelector<HTMLElement>('#marketplace');
    if (!anchor || document.querySelector('#ads')) return;

    const style = document.createElement('style');
    style.dataset.freshsaasAds = 'true';
    style.textContent = styleText;
    document.head.prepend(style);

    const section = document.createElement('section');
    section.id = 'ads';
    section.className = 'ads-rail';
    section.innerHTML = `<div class="section-wrap">
        <div class="ads-head">
            <div><span class="ads-badge"><i data-lucide="megaphone"></i> Sponsored</span><h2>Put your link in front of this audience.</h2><p>Buy a package of views and your one-line pitch rotates through this spot until the views run out. Every ad is reviewed before it goes live.</p></div>
            <button id="ads-buy-button" class="ads-buy-button" type="button"><i data-lucide="plus"></i> Advertise here</button>
        </div>
        <div id="ads-list" class="ads-list"><p class="ads-empty">No sponsored links right now — yours could be the first.</p></div>
    </div>`;
    anchor.after(section);

    const modal = document.createElement('div');
    modal.className = 'ads-modal';
    modal.id = 'ads-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="ads-modal-backdrop" data-ads-close></div><div class="ads-modal-card" role="dialog" aria-modal="true" aria-labelledby="ads-modal-title"><button class="ads-modal-close" type="button" data-ads-close aria-label="Close"><i data-lucide="x"></i></button><h2 id="ads-modal-title">Advertise on FreshSAAS</h2><form id="ads-form"><label>One-line pitch<input name="headline" type="text" required maxlength="140" placeholder="The tool that does X for Y"></label><label>Link<input name="url" type="url" required placeholder="https://"></label><label>Your email<input name="email" type="email" required placeholder="you@company.com"></label><label>Views package<div class="ads-packages">${PACKAGES.map((pack, i) => `<label class="ads-package"><input type="radio" name="pack" value="${escapeHtml(pack.value)}" ${i === 0 ? 'checked' : ''}><span>${escapeHtml(pack.label)}</span></label>`).join('')}</div></label><p class="ads-note">Ads are reviewed before going live and stop rotating once their views run out.</p><button type="submit">Continue to payment <i data-lucide="arrow-right"></i></button><p id="ads-status" class="form-status" role="status" aria-live="polite"></p></form></div>`;
    document.body.appendChild(modal);

    const list = section.querySelector<HTMLElement>('#ads-list');
    const buyButton = section.querySelector<HTMLButtonElement>('#ads-buy-button');
    const form = modal.querySelector<HTMLFormElement>('#ads-form');
    const status = modal.querySelector<HTMLElement>('#ads-status');
    let ads: Ad[] = [];
    const seenImpressions = new Set<string>();

    const renderIcons = (): void => createIcons({ icons: { Megaphone, Plus, X, ArrowRight } });

    const openModal = (): void => {
        modal.classList.add('open');
        modal.setAttribute('aria-hidden', 'false');
        document.body.style.overflow = 'hidden';
    };
    const closeModal = (): void => {
        modal.classList.remove('open');
        modal.setAttribute('aria-hidden', 'true');
        document.body.style.overflow = '';
    };

    // Fire-and-forget: a lost impression ping must never block rendering the ad.
    const recordImpression = (adId: string): void => {
        if (seenImpressions.has(adId)) return;
        seenImpressions.add(adId);
        api.post('/api/directory?action=ad-impression', { adId }).catch(() => undefined);
    };

    const renderAds = (): void => {
        if (!list) return;
        list.innerHTML = ads.length
            ? ads.map(ad => `<a class="ads-item" href="${escapeHtml(ad.url)}" target="_blank" rel="noopener sponsored" data-ad-id="${escapeHtml(ad.id)}"><span class="ads-item-tag">Sponsored</span><span class="ads-item-text">${escapeHtml(ad.headline)}</span><i data-lucide="arrow-right"></i></a>`).join('')
            : '<p class="ads-empty">No sponsored links right now — yours could be the first.</p>';
        renderIcons();
        ads.forEach(ad => recordImpression(ad.id));
    };

    const loadAds = async (): Promise<void> => {
        try {
            const response = await api.get<{ ads: Ad[] }>('/api/directory?view=ads');
            ads = response.data?.ads || [];
            renderAds();
        } catch {
            if (list) list.innerHTML = '<p class="ads-empty">Sponsored links could not be loaded.</p>';
        }
    };

    buyButton?.addEventListener('click', () => {
        if (status) { status.textContent = ''; status.className = 'form-status'; }
        openModal();
    });
    modal.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-ads-close]')) closeModal(); });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

    list?.addEventListener('click', event => {
        const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('[data-ad-id]');
        if (link) track('ad_click', { label: link.dataset.adId, entryId: link.dataset.adId });
    });

    form?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        const payload = Object.fromEntries(new FormData(form).entries());
        if (button) { button.disabled = true; button.textContent = 'Starting checkout…'; }
        try {
            const response = await api.post<{ checkoutUrl?: string }>('/api/directory?action=ad-checkout', payload);
            if (response.data.checkoutUrl) {
                if (status) { status.textContent = 'Redirecting to secure checkout…'; status.className = 'form-status success'; }
                window.location.assign(response.data.checkoutUrl);
                return;
            }
            if (status) { status.textContent = 'Checkout could not be started. Please try again.'; status.className = 'form-status error'; }
        } catch (err) {
            if (status) { status.textContent = err instanceof ApiError ? err.message : 'Could not start checkout. Please try again.'; status.className = 'form-status error'; }
        } finally {
            if (button) { button.disabled = false; button.innerHTML = 'Continue to payment <i data-lucide="arrow-right"></i>'; renderIcons(); }
        }
    });

    renderIcons();
    loadAds();
}
