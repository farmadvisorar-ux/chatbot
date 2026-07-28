import { createIcons, ArrowRight, Search, X, Bookmark, BadgeCheck, Sparkles } from 'lucide';
import { products as seedProducts, type Product } from './catalog';
import { escapeHtml } from './escape-html';
import { api } from './api-client';

// Starts as the bundled seed catalog and is replaced once the live directory
// (auto-ingested launches plus approved submissions) loads from the API.
let products: Product[] = seedProducts;

/* legacy seed data
type Product = {
  id: string;
  name: string;
  initials: string;
  category: string;
  tagline: string;
  description: string;
  audience: string;
  pricing: string;
  launched: string;
  freshness: number;
  featured?: boolean;
  accent: string;
  tags: string[];
};

const products: Product[] = [
  { id: 'inbox-copilot', name: 'Inbox Copilot', initials: 'IC', category: 'AI', tagline: 'Turn support threads into clear next actions.', description: 'Summarizes customer conversations, drafts useful replies, and turns recurring questions into searchable product insight.', audience: 'Support teams and founders', pricing: 'Free trial', launched: '2 hours ago', freshness: 98, featured: true, accent: '#ff7d66', tags: ['Support', 'Automation', 'AI'] },
  { id: 'process-builder', name: 'Process Builder', initials: 'PB', category: 'Operations', tagline: 'Build repeatable workflows without a long rollout.', description: 'Maps ownership, creates lightweight checklists, and helps small teams automate recurring operational work.', audience: 'Operators and agencies', pricing: 'From $19/mo', launched: '5 hours ago', freshness: 95, accent: '#c9ff57', tags: ['Workflow', 'Teams', 'No-code'] },
  { id: 'signal-monitor', name: 'Signal Monitor', initials: 'SM', category: 'Analytics', tagline: 'Know what changed before the next meeting.', description: 'Watches key metrics and explains meaningful movement in plain English so teams can respond faster.', audience: 'Growth and product teams', pricing: 'Free beta', launched: 'Today', freshness: 92, accent: '#7ac7ff', tags: ['Metrics', 'Alerts', 'Reporting'] },
  { id: 'briefly-ai', name: 'Briefly AI', initials: 'BA', category: 'AI', tagline: 'Turn long research into decision-ready briefs.', description: 'Condenses documents, notes, and links into structured summaries with risks, decisions, and open questions.', audience: 'Consultants and executives', pricing: 'From $12/mo', launched: 'Yesterday', freshness: 88, accent: '#ffd36a', tags: ['Research', 'Writing', 'AI'] },
  { id: 'client-handoff', name: 'Client Handoff', initials: 'CH', category: 'Sales', tagline: 'Move closed deals into delivery without dropped details.', description: 'Collects promises, files, stakeholders, and timelines from the sales process into one clean onboarding handoff.', audience: 'Sales and delivery teams', pricing: 'From $29/mo', launched: '1 day ago', freshness: 85, accent: '#90e0c1', tags: ['CRM', 'Onboarding', 'Teams'] },
  { id: 'screenloop', name: 'Screenloop', initials: 'SL', category: 'Productivity', tagline: 'Record polished product walkthroughs in minutes.', description: 'Creates guided demos with chapters, callouts, and shareable links without requiring a video editor.', audience: 'Founders and product marketers', pricing: 'Freemium', launched: '2 days ago', freshness: 81, accent: '#c9b7ff', tags: ['Demo', 'Video', 'Marketing'] },
  { id: 'ledger-lane', name: 'Ledger Lane', initials: 'LL', category: 'Finance', tagline: 'A calmer command center for startup cash flow.', description: 'Combines runway, upcoming bills, and scenario planning into a simple financial view for small businesses.', audience: 'Founders and finance leads', pricing: 'From $24/mo', launched: '3 days ago', freshness: 76, accent: '#ffb7a7', tags: ['Runway', 'Forecasting', 'Finance'] },
  { id: 'form-signal', name: 'Form Signal', initials: 'FS', category: 'Marketing', tagline: 'Find the intent hidden inside every form response.', description: 'Groups submissions by need, urgency, and buying signal so teams can prioritize the right follow-up.', audience: 'Marketing and sales teams', pricing: 'Free trial', launched: '4 days ago', freshness: 72, accent: '#bde58d', tags: ['Forms', 'Leads', 'Insights'] }
];
*/

const styleText = `
.launch-directory{padding:118px 0;background:#f5f6ef}.directory-head{display:grid;grid-template-columns:1.2fr .8fr;gap:48px;align-items:end;margin-bottom:34px}.directory-head h2{font-family:'Syne',sans-serif;font-size:clamp(40px,5vw,66px);line-height:1;letter-spacing:-.06em;margin:0}.directory-head p{color:#697064;line-height:1.7;margin:0}.directory-toolbar{display:grid;grid-template-columns:minmax(240px,1fr) auto auto;gap:12px;align-items:center;margin-bottom:22px}.directory-search{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid rgba(16,19,27,.15);border-radius:14px;padding:0 14px}.directory-search svg{width:18px;color:#737a6f}.directory-search input{width:100%;border:0;background:transparent;padding:14px 0;outline:0}.category-filters{display:flex;gap:8px;flex-wrap:wrap}.filter-button,.saved-toggle,.sort-select{border:1px solid rgba(16,19,27,.15);background:#fff;color:#30362d;border-radius:12px;padding:11px 13px;font-weight:700;font-size:13px}.filter-button,.saved-toggle{cursor:pointer}.filter-button.active,.saved-toggle.active{background:#10131b;color:#fff;border-color:#10131b}.saved-toggle{display:flex;align-items:center;gap:8px}.saved-toggle svg{width:16px}.directory-summary{display:flex;justify-content:space-between;align-items:center;color:#747b70;font-size:13px;margin:18px 2px}.directory-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}.directory-card{background:#fff;border:1px solid rgba(16,19,27,.13);border-radius:20px;padding:20px;min-height:330px;display:flex;flex-direction:column;transition:transform .22s ease,box-shadow .22s ease,border-color .22s ease}.directory-card:hover{transform:translateY(-5px);box-shadow:0 24px 56px rgba(16,19,27,.1);border-color:rgba(16,19,27,.28)}.directory-card-top{display:flex;justify-content:space-between;align-items:flex-start}.directory-logo{width:50px;height:50px;border-radius:15px;display:grid;place-items:center;font-family:'Syne',sans-serif;font-weight:800;color:#10131b}.save-button{width:39px;height:39px;border-radius:12px;border:1px solid rgba(16,19,27,.13);background:#fff;display:grid;place-items:center;cursor:pointer}.save-button svg{width:17px}.save-button.saved{background:#10131b;color:#c9ff57}.directory-category{font-size:10px;letter-spacing:.12em;text-transform:uppercase;font-weight:800;color:#6a715f;margin:24px 0 8px}.directory-card h3{font-family:'Syne',sans-serif;font-size:27px;letter-spacing:-.04em;margin:0 0 8px}.directory-tagline{font-weight:700;line-height:1.45;margin:0}.directory-description{color:#6d7469;font-size:14px;line-height:1.6;margin:12px 0 20px}.directory-card-footer{margin-top:auto;border-top:1px solid rgba(16,19,27,.1);padding-top:15px;display:flex;justify-content:space-between;align-items:center;gap:12px}.freshness{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:800;color:#5e674f}.freshness svg{width:15px;color:#6e7e42}.details-button{border:0;background:transparent;display:flex;align-items:center;gap:7px;font-weight:800;cursor:pointer}.details-button svg{width:16px}.directory-empty{grid-column:1/-1;padding:52px;text-align:center;border:1px dashed rgba(16,19,27,.2);border-radius:18px;color:#6d7469;background:rgba(255,255,255,.5)}.product-modal{position:fixed;inset:0;display:grid;place-items:center;z-index:90;opacity:0;visibility:hidden;transition:.2s ease}.product-modal.open{opacity:1;visibility:visible}.product-modal-backdrop{position:absolute;inset:0;background:rgba(12,15,20,.72);backdrop-filter:blur(9px)}.product-modal-card{position:relative;z-index:1;width:min(650px,calc(100% - 28px));max-height:88vh;overflow:auto;background:#f5f6ef;border-radius:24px;padding:34px;box-shadow:0 32px 90px rgba(0,0,0,.35)}.product-modal-close{position:absolute;top:17px;right:17px;width:40px;height:40px;border-radius:12px;border:1px solid rgba(16,19,27,.14);background:#fff;display:grid;place-items:center;cursor:pointer}.product-modal-close svg{width:18px}.modal-product-logo{width:64px;height:64px;border-radius:18px;display:grid;place-items:center;font-family:'Syne',sans-serif;font-size:20px;font-weight:800}.product-modal-card h2{font-family:'Syne',sans-serif;font-size:42px;letter-spacing:-.055em;margin:20px 0 8px}.product-modal-card>p{color:#626a5e;line-height:1.7}.product-facts{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin:24px 0}.product-fact{background:#fff;border:1px solid rgba(16,19,27,.12);border-radius:14px;padding:14px}.product-fact small{display:block;color:#7b8277;margin-bottom:6px}.product-fact strong{font-size:13px}.product-tags{display:flex;gap:8px;flex-wrap:wrap}.product-tag{background:#e8eadf;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:700}.product-modal-actions{display:flex;gap:10px;margin-top:26px}.product-modal-actions a,.product-modal-actions button{flex:1;border-radius:12px;padding:14px 16px;font-weight:800;text-align:center;text-decoration:none;cursor:pointer}.product-modal-actions a{background:#c9ff57;color:#10131b;border:1px solid #10131b}.product-modal-actions button{background:#10131b;color:#fff;border:1px solid #10131b}.directory-badge{display:inline-flex;align-items:center;gap:7px;font-family:'Syne',sans-serif;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#65704f;margin-bottom:14px}.directory-badge svg{width:16px}.directory-card.featured{background:#10131b;color:#fff}.directory-card.featured .directory-description,.directory-card.featured .directory-category{color:#b9c0b4}.directory-card.featured .directory-card-footer{border-color:rgba(255,255,255,.14)}.directory-card.featured .details-button,.directory-card.featured .freshness{color:#fff}.directory-card.featured .save-button{background:rgba(255,255,255,.08);border-color:rgba(255,255,255,.16);color:#fff}.directory-card.featured .save-button.saved{background:#c9ff57;color:#10131b}.directory-card.pilot-featured{position:relative;isolation:isolate;border-color:transparent;box-shadow:0 22px 70px rgba(73,145,196,.24),0 0 28px rgba(201,255,87,.13)}.directory-card.pilot-featured:before{content:'';position:absolute;inset:-2px;border-radius:22px;padding:2px;background:linear-gradient(110deg,#7ac7ff 0%,#fff 18%,#c9ff57 36%,#7ac7ff 54%,#fff 72%,#c9ff57 88%,#7ac7ff 100%);background-size:300% 100%;-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:pilot-border-shimmer 3s linear infinite;pointer-events:none;z-index:3}.directory-card.pilot-featured:after{content:'';position:absolute;inset:-8px;border-radius:28px;background:linear-gradient(110deg,rgba(122,199,255,.26),rgba(201,255,87,.18),rgba(255,255,255,.14));filter:blur(14px);opacity:.55;z-index:-1;pointer-events:none}.project-url{display:inline-flex;align-items:center;width:max-content;color:#c9ff57;font-size:13px;font-weight:800;text-decoration:none;margin:0 0 18px}.project-url:hover{text-decoration:underline}.directory-card.pilot-featured .project-url{color:#7ac7ff}.modal-project-url{display:inline-flex;margin:2px 0 8px;color:#315e82;font-weight:800;text-decoration:none}.modal-project-url:hover{text-decoration:underline}@keyframes pilot-border-shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@media(prefers-reduced-motion:reduce){.directory-card.pilot-featured:before{animation:none;background-position:50% 0}}@media(max-width:980px){.directory-head{grid-template-columns:1fr}.directory-toolbar{grid-template-columns:1fr}.directory-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.launch-directory{padding:82px 0}.directory-grid{grid-template-columns:1fr}.category-filters{overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}.filter-button{white-space:nowrap}.directory-summary{align-items:flex-start;gap:8px;flex-direction:column}.product-facts{grid-template-columns:1fr}.product-modal-card{padding:28px 20px}.product-modal-card h2{font-size:34px}.product-modal-actions{flex-direction:column}}
`;

const savedIds = (): string[] => {
  try { return JSON.parse(localStorage.getItem('freshsaas_saved') || '[]') as string[]; } catch { return []; }
};

// The three "Preview launch" cards in the hero/preview sections above the
// live directory are marketing teasers, not real catalog entries. Their copy
// mirrors what's hardcoded in index.html so the modal a click opens matches
// what the card already promised, rather than a scroll to a directory that
// will never actually contain them.
const teaserProducts: Product[] = [
  { id: 'inbox-copilot', name: 'Inbox Copilot', initials: 'IC', category: 'AI + Support', tagline: 'Turn messy support threads into clear next actions.', description: 'Turn messy support threads into clear next actions, draft replies, and searchable customer insights.', audience: 'Support teams and founders', pricing: 'Free trial', launched: '2 hours ago', freshness: 98, accent: '#ff7d66', tags: ['Support', 'Automation', 'AI'], url: '#launch-directory' },
  { id: 'process-builder', name: 'Process Builder', initials: 'PB', category: 'Operations', tagline: 'Launch lightweight automations without a six-week rollout.', description: 'Map repeatable workflows, assign ownership, and launch lightweight automations without a six-week rollout.', audience: 'Operators and agencies', pricing: 'From $19/mo', launched: 'Fresh pick', freshness: 95, accent: '#c9ff57', tags: ['Workflow', 'Teams', 'No-code'], url: '#launch-directory' },
  { id: 'signal-monitor', name: 'Signal Monitor', initials: 'SM', category: 'Analytics', tagline: 'Know what changed before your next meeting.', description: 'Know what changed across your key metrics and get a plain-English explanation before your next meeting.', audience: 'Growth and product teams', pricing: 'Free beta', launched: 'Today', freshness: 92, accent: '#7ac7ff', tags: ['Metrics', 'Alerts', 'Reporting'], url: '#launch-directory' },
];
const teaserIds = new Set(teaserProducts.map(product => product.id));

/**
 * Lets other modules (the hero/preview "Preview launch" buttons) open the
 * same product detail modal the live directory uses, keyed by product id.
 * Set once initDirectory() has built the modal; returns false if the id
 * isn't known yet (e.g. before the live directory has loaded) so the caller
 * can fall back to something else.
 */
let openProductById: ((id: string) => boolean) | null = null;
export function previewProduct(id: string): boolean {
  return openProductById ? openProductById(id) : false;
}

export function initDirectory(): void {
  const preview = document.querySelector<HTMLElement>('.launch-preview');
  if (!preview || document.querySelector('#launch-directory')) return;

  const style = document.createElement('style');
  style.dataset.freshsaasDirectory = 'true';
  style.textContent = styleText;
  document.head.appendChild(style);

  const section = document.createElement('section');
  section.id = 'launch-directory';
  section.className = 'launch-directory';
  section.innerHTML = `<div class="section-wrap"><div class="directory-head"><div><span class="directory-badge"><i data-lucide="sparkles"></i>Multi-source discovery • ${products.length} verified launches</span><h2>Browse what just launched.</h2></div><p>Browse launches discovered across Product Hunt, BetaList, Launching Next, Microlaunch, Tiny Startups, and other current feeds. Search by product, category, audience, source, or use case.</p></div><div class="directory-toolbar"><label class="directory-search"><i data-lucide="search"></i><span class="sr-only">Search launches</span><input id="directory-search" type="search" placeholder="Search products, use cases, or audiences"></label><div id="category-filters" class="category-filters"></div><div><button id="saved-toggle" class="saved-toggle" type="button"><i data-lucide="bookmark"></i><span>Saved</span></button><select id="sort-select" class="sort-select" aria-label="Sort launches"><option value="fresh">Freshest</option><option value="name">A–Z</option></select></div></div><div class="directory-summary"><span id="directory-count"></span><span>Duplicate-safe catalog • 35 newest multi-source additions • Saved locally on this device</span></div><div id="directory-grid" class="directory-grid"></div></div>`;
  preview.after(section);

  const modal = document.createElement('div');
  modal.className = 'product-modal';
  modal.id = 'product-modal';
  modal.setAttribute('aria-hidden', 'true');
  modal.innerHTML = `<div class="product-modal-backdrop" data-product-close></div><article class="product-modal-card" role="dialog" aria-modal="true" aria-labelledby="product-modal-title"><button class="product-modal-close" type="button" aria-label="Close launch profile" data-product-close><i data-lucide="x"></i></button><div id="product-modal-content"></div></article>`;
  document.body.appendChild(modal);

  const search = section.querySelector<HTMLInputElement>('#directory-search');
  const filterWrap = section.querySelector<HTMLElement>('#category-filters');
  const grid = section.querySelector<HTMLElement>('#directory-grid');
  const count = section.querySelector<HTMLElement>('#directory-count');
  const savedToggle = section.querySelector<HTMLButtonElement>('#saved-toggle');
  const sort = section.querySelector<HTMLSelectElement>('#sort-select');
  const modalContent = modal.querySelector<HTMLElement>('#product-modal-content');
  let category = 'All';
  let savedOnly = false;

  const renderCategoryFilters = (): void => {
    if (!filterWrap) return;
    const categories = ['All', ...Array.from(new Set(products.map(product => product.category)))];
    filterWrap.innerHTML = categories.map(item => `<button class="filter-button${item === category ? ' active' : ''}" type="button" data-category="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join('');
  };
  renderCategoryFilters();

  const closeModal = (): void => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openModal = (product: Product): void => {
    if (!modalContent) return;
    const isSaved = savedIds().includes(product.id);
    const isTeaser = teaserIds.has(product.id);
    const actions = isTeaser
      ? `<a href="#launch-directory" data-teaser-jump>Browse live launches <i data-lucide="arrow-right"></i></a>`
      : `<a href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.id === 'pilot-policy' ? 'Visit PilotPolicy.com' : product.website ? 'Visit website' : product.source ? `View on ${product.source}` : product.url.includes('producthunt.com') ? 'View on Product Hunt' : 'Visit website')} <i data-lucide="arrow-right"></i></a><button type="button" data-modal-save="${escapeHtml(product.id)}">${isSaved ? 'Saved to collection' : 'Save this launch'}</button>`;
    modalContent.innerHTML = `<div class="modal-product-logo" style="background:${escapeHtml(product.accent)}">${escapeHtml(product.initials)}</div><h2 id="product-modal-title">${escapeHtml(product.name)}</h2><p><strong>${escapeHtml(product.tagline)}</strong></p><p>${escapeHtml(product.description)}</p>${product.id === 'pilot-policy' ? `<a class="modal-project-url" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">PilotPolicy.com</a>` : ''}${isTeaser ? `<p style="font-size:12px;color:#8a9182;margin:-4px 0 4px"><em>Preview example — browse real launches below.</em></p>` : ''}<div class="product-facts"><div class="product-fact"><small>Best for</small><strong>${escapeHtml(product.audience)}</strong></div><div class="product-fact"><small>Pricing</small><strong>${escapeHtml(product.pricing)}</strong></div><div class="product-fact"><small>Discovered</small><strong>${escapeHtml(product.launched)}</strong></div><div class="product-fact"><small>Source</small><strong>${escapeHtml(product.source || (isTeaser ? 'Preview' : product.url.includes('producthunt.com') ? 'Product Hunt' : 'Direct listing'))}</strong></div></div><div class="product-tags">${product.tags.map(tag => `<span class="product-tag">${escapeHtml(tag)}</span>`).join('')}</div><div class="product-modal-actions">${actions}</div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    createIcons({ icons: { ArrowRight } });
  };

  openProductById = (id: string): boolean => {
    const product = products.find(item => item.id === id) ?? teaserProducts.find(item => item.id === id);
    if (!product) return false;
    openModal(product);
    return true;
  };

  const toggleSave = (id: string): void => {
    const current = savedIds();
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    localStorage.setItem('freshsaas_saved', JSON.stringify(next));
    render();
    const product = products.find(item => item.id === id);
    if (modal.classList.contains('open') && product) openModal(product);
  };

  const render = (): void => {
    if (!grid || !count) return;
    const query = search?.value.trim().toLowerCase() || '';
    const saved = savedIds();
    const filtered = products.filter(product => {
      const haystack = [product.name, product.category, product.tagline, product.description, product.audience, ...product.tags].join(' ').toLowerCase();
      return (category === 'All' || product.category === category) && (!query || haystack.includes(query)) && (!savedOnly || saved.includes(product.id));
    }).sort((a, b) => sort?.value === 'name' ? a.name.localeCompare(b.name) : b.freshness - a.freshness);

    count.textContent = `${filtered.length} launch${filtered.length === 1 ? '' : 'es'} showing`;
    grid.innerHTML = filtered.length ? filtered.map(product => `<article class="directory-card${product.featured ? ' featured' : ''}${product.id === 'pilot-policy' ? ' pilot-featured' : ''}" data-product-id="${escapeHtml(product.id)}"><div class="directory-card-top"><span class="directory-logo" style="background:${escapeHtml(product.accent)}">${escapeHtml(product.initials)}</span><button class="save-button${saved.includes(product.id) ? ' saved' : ''}" type="button" aria-label="${escapeHtml(saved.includes(product.id) ? 'Remove' : 'Save')} ${escapeHtml(product.name)}" data-save="${escapeHtml(product.id)}"><i data-lucide="bookmark"></i></button></div><span class="directory-category">${escapeHtml(product.category)} • ${escapeHtml(product.launched)}</span><h3>${escapeHtml(product.name)}</h3><p class="directory-tagline">${escapeHtml(product.tagline)}</p><p class="directory-description">${escapeHtml(product.description)}</p>${product.id === 'pilot-policy' ? `<a class="project-url" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit PilotPolicy.com">PilotPolicy.com</a>` : ''}<div class="directory-card-footer"><span class="freshness"><i data-lucide="badge-check"></i>${product.freshness}% fresh</span><button class="details-button" type="button" data-details="${escapeHtml(product.id)}">${product.id === 'pilot-policy' ? 'View project' : 'View launch'} <i data-lucide="arrow-right"></i></button></div></article>`).join('') : '<div class="directory-empty">No launches match those filters yet. Try a broader search or switch back to All.</div>';
    createIcons({ icons: { ArrowRight, Bookmark, BadgeCheck } });
  };

  filterWrap?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
    if (!button) return;
    category = button.dataset.category || 'All';
    filterWrap.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('active', item === button));
    render();
  });

  grid?.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const saveButton = target.closest<HTMLButtonElement>('[data-save]');
    if (saveButton?.dataset.save) { toggleSave(saveButton.dataset.save); return; }
    const detailsButton = target.closest<HTMLButtonElement>('[data-details]');
    const product = products.find(item => item.id === detailsButton?.dataset.details);
    if (product) openModal(product);
  });

  modal.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-product-close]')) { closeModal(); return; }
    if (target.closest('[data-teaser-jump]')) { closeModal(); return; }
    const saveButton = target.closest<HTMLButtonElement>('[data-modal-save]');
    if (saveButton?.dataset.modalSave) toggleSave(saveButton.dataset.modalSave);
  });

  search?.addEventListener('input', render);
  sort?.addEventListener('change', render);
  savedToggle?.addEventListener('click', () => {
    savedOnly = !savedOnly;
    savedToggle.classList.toggle('active', savedOnly);
    render();
  });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeModal(); });

  /**
   * Pulls the live directory (hourly-ingested launches plus approved founder
   * submissions) and merges it ahead of the bundled seed catalog. Seeded
   * entries stay as a fallback so the grid is never empty if the API is
   * unreachable; duplicates by name resolve in favour of the live row.
   */
  const loadLiveLaunches = async (): Promise<void> => {
    try {
      const response = await api.get<{ launches: Product[] }>('/api/directory');
      const live = response.data?.launches ?? [];
      if (!live.length) return;

      const seen = new Set<string>();
      products = [...live, ...seedProducts].filter(product => {
        const key = product.name.trim().toLowerCase().replace(/\s+/g, ' ');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      const badge = section.querySelector<HTMLElement>('.directory-badge');
      if (badge) badge.innerHTML = `<i data-lucide="sparkles"></i>Multi-source discovery • ${products.length} launches`;
      renderCategoryFilters();
      render();
      createIcons({ icons: { Search, Bookmark, Sparkles, X } });
    } catch {
      /* Keep showing the seeded catalog if the live directory is unavailable. */
    }
  };

  createIcons({ icons: { Search, Bookmark, Sparkles, X } });
  render();
  loadLiveLaunches();
}
