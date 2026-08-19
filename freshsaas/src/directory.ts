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

/* Feed state ---------------------------------------------------------------
 * Votes are the engagement loop every competing launch directory runs on and
 * this one had none. The voter key is anonymous and lives in localStorage, so
 * nobody has to create an account to take part.
 */
const VOTER_KEY = 'freshsaas_voter';
const VOTED_KEY = 'freshsaas_voted';
const LAST_VISIT_KEY = 'freshsaas_last_visit';
const PAGE_SIZE = 48;
const DAY_MS = 864e5;

const voterKey = (): string => {
  try {
    let key = localStorage.getItem(VOTER_KEY);
    if (!key) {
      key = `v${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      localStorage.setItem(VOTER_KEY, key);
    }
    return key;
  } catch { return ''; }
};

const votedIds = (): string[] => {
  try { return JSON.parse(localStorage.getItem(VOTED_KEY) || '[]') as string[]; } catch { return []; }
};

const rememberVote = (id: string, on: boolean): void => {
  const next = on ? [...new Set([...votedIds(), id])] : votedIds().filter(item => item !== id);
  try { localStorage.setItem(VOTED_KEY, JSON.stringify(next)); } catch { /* private mode */ }
};

/** Timestamp of the previous visit, read once before it is overwritten. */
const lastVisit = (() => {
  try {
    const raw = Number(localStorage.getItem(LAST_VISIT_KEY) || 0);
    localStorage.setItem(LAST_VISIT_KEY, String(Date.now()));
    return raw;
  } catch { return 0; }
})();

/**
 * Which dated section a launch belongs in. Grouping the feed by day is what
 * gives someone a reason to come back tomorrow — a flat list sorted by
 * freshness looks identical whether one launch arrived or forty.
 */
// freshness doubles as the sort weight — the seed catalog starts at 135 and
// featured entries get 200 minus their rank — so it has to be clamped before
// being shown as a percentage. Cards were displaying "123% fresh".
const BUCKET_ORDER = ['Featured', 'Today', 'Yesterday', 'This week', 'This month', 'Earlier'];

const bucketOf = (product: Product): string => {
  if (product.featured || product.id === 'pilot-policy') return 'Featured';
  if (!product.discoveredAt) return 'Earlier';
  const age = Date.now() - new Date(product.discoveredAt).getTime();
  if (age < DAY_MS) return 'Today';
  if (age < 2 * DAY_MS) return 'Yesterday';
  if (age < 7 * DAY_MS) return 'This week';
  if (age < 30 * DAY_MS) return 'This month';
  return 'Earlier';
};


export function initDirectory(): void {
  const preview = document.querySelector<HTMLElement>('.launch-preview');
  if (!preview || document.querySelector('#launch-directory')) return;

  const style = document.createElement('style');
  style.dataset.freshsaasDirectory = 'true';
  style.textContent = styleText;
  // Prepended, not appended: these are this component's base styles, so they
  // have to sit *before* the bundled sheets or they'd beat the theme layer on
  // cascade order and the directory would stay light on a dark page.
  document.head.prepend(style);

  const section = document.createElement('section');
  section.id = 'launch-directory';
  section.className = 'launch-directory';
  section.innerHTML = `<div class="section-wrap"><div class="directory-head"><div><span class="directory-badge"><i data-lucide="sparkles"></i>Multi-source discovery • ${products.length} verified launches</span><h2>Browse what just launched.</h2></div><p>Browse launches discovered across Product Hunt, BetaList, Launching Next, Microlaunch, Tiny Startups, and other current feeds. Search by product, category, audience, source, or use case.</p></div><div class="directory-toolbar"><label class="directory-search"><i data-lucide="search"></i><span class="sr-only">Search launches</span><input id="directory-search" type="search" placeholder="Search products, use cases, or audiences"></label><div id="category-filters" class="category-filters"></div><div><button id="saved-toggle" class="saved-toggle" type="button"><i data-lucide="bookmark"></i><span>Saved</span></button><select id="sort-select" class="sort-select" aria-label="Sort launches"><option value="fresh">Freshest</option><option value="votes">Most upvoted</option><option value="name">A–Z</option></select></div></div><div class="directory-summary"><span id="directory-count"></span><span>Duplicate-safe catalog • 35 newest multi-source additions • Saved locally on this device</span></div><div id="directory-new" class="directory-new" hidden></div><div id="directory-grid" class="directory-grid"></div></div>`;
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

  // Thirty-odd categories wrapped onto five rows and pushed the listings
  // most of a screen down the page. Show the busiest ones, keep the rest
  // behind a toggle, and always keep the active one visible.
  const CATEGORY_PREVIEW = 11;
  let showAllCategories = false;

  const renderCategoryFilters = (): void => {
    if (!filterWrap) return;
    const counts = new Map<string, number>();
    products.forEach(product => counts.set(product.category, (counts.get(product.category) ?? 0) + 1));
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);

    let shown = ranked;
    if (!showAllCategories && ranked.length > CATEGORY_PREVIEW) {
      shown = ranked.slice(0, CATEGORY_PREVIEW);
      if (category !== 'All' && !shown.includes(category)) shown = [...shown.slice(0, CATEGORY_PREVIEW - 1), category];
    }

    const hidden = ranked.length - shown.length;
    filterWrap.innerHTML = ['All', ...shown]
      .map(item => `<button class="filter-button${item === category ? ' active' : ''}" type="button" data-category="${escapeHtml(item)}">${escapeHtml(item)}${item !== 'All' ? `<span class="filter-count">${counts.get(item) ?? 0}</span>` : ''}</button>`)
      .join('')
      + (hidden > 0
        ? `<button class="filter-button filter-more" type="button" data-more-categories>+${hidden} more</button>`
        : ranked.length > CATEGORY_PREVIEW
          ? '<button class="filter-button filter-more" type="button" data-more-categories>Show fewer</button>'
          : '');
  };

  filterWrap?.addEventListener('click', event => {
    if (!(event.target as HTMLElement).closest('[data-more-categories]')) return;
    showAllCategories = !showAllCategories;
    renderCategoryFilters();
  });

  renderCategoryFilters();

  const closeModal = (): void => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  };

  const openModal = (product: Product): void => {
    if (!modalContent) return;
    const isSaved = savedIds().includes(product.id);
    modalContent.innerHTML = `<div class="modal-product-logo" style="background:${escapeHtml(product.accent)}">${escapeHtml(product.initials)}</div><h2 id="product-modal-title">${escapeHtml(product.name)}</h2><p><strong>${escapeHtml(product.tagline)}</strong></p><p>${escapeHtml(product.description)}</p>${product.id === 'pilot-policy' ? `<a class="modal-project-url" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">PilotPolicy.com</a>` : ''}<div class="product-facts"><div class="product-fact"><small>Best for</small><strong>${escapeHtml(product.audience)}</strong></div><div class="product-fact"><small>Pricing</small><strong>${escapeHtml(product.pricing)}</strong></div><div class="product-fact"><small>Discovered</small><strong>${escapeHtml(product.launched)}</strong></div><div class="product-fact"><small>Source</small><strong>${escapeHtml(product.source || (product.url.includes('producthunt.com') ? 'Product Hunt' : 'Direct listing'))}</strong></div></div><div class="product-tags">${product.tags.map(tag => `<span class="product-tag">${escapeHtml(tag)}</span>`).join('')}</div><div class="product-modal-actions"><a href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(product.id === 'pilot-policy' ? 'Visit PilotPolicy.com' : product.website ? 'Visit website' : product.source ? `View on ${product.source}` : product.url.includes('producthunt.com') ? 'View on Product Hunt' : 'Visit website')} <i data-lucide="arrow-right"></i></a><button type="button" data-modal-save="${escapeHtml(product.id)}">${isSaved ? 'Saved to collection' : 'Save this launch'}</button></div>`;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    createIcons({ icons: { ArrowRight } });
  };

  const toggleSave = (id: string): void => {
    const current = savedIds();
    const next = current.includes(id) ? current.filter(item => item !== id) : [...current, id];
    localStorage.setItem('freshsaas_saved', JSON.stringify(next));
    render();
    const product = products.find(item => item.id === id);
    if (modal.classList.contains('open') && product) openModal(product);
  };

  let renderLimit = PAGE_SIZE;

  const cardMarkup = (product: Product, saved: string[], voted: string[]): string => {
    const canVote = product.id.startsWith('db-');
    const isVoted = voted.includes(product.id);
    return `<article class="directory-card${product.featured ? ' featured' : ''}${product.id === 'pilot-policy' ? ' pilot-featured' : ''}" data-product-id="${escapeHtml(product.id)}"><div class="directory-card-top"><span class="directory-logo" style="background:${escapeHtml(product.accent)}">${escapeHtml(product.initials)}</span><div class="card-actions">${canVote ? `<button class="vote-button${isVoted ? ' voted' : ''}" type="button" data-vote="${escapeHtml(product.id)}" aria-pressed="${isVoted}" aria-label="Upvote ${escapeHtml(product.name)}"><span class="vote-caret">▲</span><span class="vote-count">${product.votes ?? 0}</span></button>` : ''}<button class="save-button${saved.includes(product.id) ? ' saved' : ''}" type="button" aria-label="${escapeHtml(saved.includes(product.id) ? 'Remove' : 'Save')} ${escapeHtml(product.name)}" data-save="${escapeHtml(product.id)}"><i data-lucide="bookmark"></i></button></div></div><span class="directory-category">${escapeHtml(product.category)} • ${escapeHtml(product.launched)}</span><h3>${escapeHtml(product.name)}</h3><p class="directory-tagline">${escapeHtml(product.tagline)}</p><p class="directory-description">${escapeHtml(product.description)}</p>${product.id === 'pilot-policy' ? `<a class="project-url" href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit PilotPolicy.com">PilotPolicy.com</a>` : ''}<div class="directory-card-footer"><span class="freshness"><i data-lucide="badge-check"></i>${Math.min(100, product.freshness)}% fresh</span><button class="details-button" type="button" data-details="${escapeHtml(product.id)}">${product.id === 'pilot-policy' ? 'View project' : 'View launch'} <i data-lucide="arrow-right"></i></button></div></article>`;
  };

  const visibleProducts = (): Product[] => {
    const query = search?.value.trim().toLowerCase() || '';
    const saved = savedIds();
    return products.filter(product => {
      const haystack = [product.name, product.category, product.tagline, product.description, product.audience, ...product.tags].join(' ').toLowerCase();
      return (category === 'All' || product.category === category) && (!query || haystack.includes(query)) && (!savedOnly || saved.includes(product.id));
    }).sort((a, b) => {
      // Pinning is applied before the chosen sort, so featured entries stay at
      // the top under A–Z as well as under Freshest. The previous approach gave
      // the pinned entry a freshness of 101, which silently stopped working the
      // moment anyone switched the sort to name.
      const rank = (product: Product): number =>
        product.id === 'pilot-policy' ? 0 : product.featured ? 1 : 2;
      const difference = rank(a) - rank(b);
      if (difference !== 0) return difference;

      // In the chronological view, order by dated section first so the day
      // headings run Today -> Yesterday -> This week and never repeat.
      if ((sort?.value || 'fresh') === 'fresh') {
        const bucketDifference = BUCKET_ORDER.indexOf(bucketOf(a)) - BUCKET_ORDER.indexOf(bucketOf(b));
        if (bucketDifference !== 0) return bucketDifference;
      }

      if (sort?.value === 'name') return a.name.localeCompare(b.name);
      if (sort?.value === 'votes') return (b.votes ?? 0) - (a.votes ?? 0) || b.freshness - a.freshness;
      return b.freshness - a.freshness;
    });
  };

  const render = (reset = true): void => {
    if (!grid || !count) return;
    if (reset) renderLimit = PAGE_SIZE;

    const filtered = visibleProducts();
    const saved = savedIds();
    const voted = votedIds();
    count.textContent = `${filtered.length} launch${filtered.length === 1 ? '' : 'es'} showing`;

    if (!filtered.length) {
      grid.innerHTML = '<div class="directory-empty">No launches match those filters yet. Try a broader search or switch back to All.</div>';
      return;
    }

    // Only the freshness view is chronological, so day headings would be
    // meaningless — and misleading — under A–Z or Most upvoted.
    const grouped = (sort?.value || 'fresh') === 'fresh';
    const page = filtered.slice(0, renderLimit);
    let html = '';
    let bucket = '';

    page.forEach(product => {
      if (grouped) {
        const next = bucketOf(product);
        if (next !== bucket) {
          bucket = next;
          const size = filtered.filter(item => bucketOf(item) === next).length;
          html += `<h3 class="day-heading" data-day-group="${escapeHtml(next)}">${escapeHtml(next)}<span>${size}</span></h3>`;
        }
      }
      html += cardMarkup(product, saved, voted);
    });

    const remaining = filtered.length - page.length;
    // Rendering all 380+ cards at once put ~8,700 nodes in the document and
    // made every keystroke in the search box re-render the lot.
    if (remaining > 0) {
      html += `<button class="load-more" type="button" data-load-more>Show ${Math.min(PAGE_SIZE, remaining)} more <span>${remaining} left</span></button>`;
    }

    grid.innerHTML = html;
    createIcons({ icons: { ArrowRight, Bookmark, BadgeCheck } });
  };

  /** "12 new since your last visit" — the cheapest reason to come back. */
  const renderNewBanner = (): void => {
    const banner = document.querySelector<HTMLElement>('#directory-new');
    if (!banner || !lastVisit) return;
    const fresh = products.filter(product =>
      product.discoveredAt && new Date(product.discoveredAt).getTime() > lastVisit);
    if (!fresh.length) return;
    banner.innerHTML = `<span class="dot"></span><strong>${fresh.length} new launch${fresh.length === 1 ? '' : 'es'}</strong> since your last visit`;
    banner.hidden = false;
  };

  filterWrap?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
    if (!button) return;
    category = button.dataset.category || 'All';
    filterWrap.querySelectorAll('.filter-button').forEach(item => item.classList.toggle('active', item === button));
    render();
  });

  /**
   * Optimistic: the count moves immediately and is reverted if the request
   * fails, because waiting on a round trip to acknowledge a click is what
   * makes voting feel broken.
   */
  const toggleVote = async (id: string, button: HTMLButtonElement): Promise<void> => {
    const product = products.find(item => item.id === id);
    if (!product) return;
    const withdraw = votedIds().includes(id);
    const countEl = button.querySelector<HTMLElement>('.vote-count');
    const before = product.votes ?? 0;

    product.votes = Math.max(0, before + (withdraw ? -1 : 1));
    button.classList.toggle('voted', !withdraw);
    button.setAttribute('aria-pressed', String(!withdraw));
    if (countEl) countEl.textContent = String(product.votes);
    rememberVote(id, !withdraw);

    try {
      const response = await api.post<{ votes: number }>('/api/directory?action=vote', {
        entryId: id, voterKey: voterKey(), withdraw,
      });
      const server = response.data?.votes;
      if (typeof server === 'number') {
        product.votes = server;
        if (countEl) countEl.textContent = String(server);
      }
    } catch {
      product.votes = before;
      button.classList.toggle('voted', withdraw);
      button.setAttribute('aria-pressed', String(withdraw));
      if (countEl) countEl.textContent = String(before);
      rememberVote(id, withdraw);
    }
  };

  grid?.addEventListener('click', event => {
    const target = event.target as HTMLElement;

    const more = target.closest<HTMLButtonElement>('[data-load-more]');
    if (more) {
      renderLimit += PAGE_SIZE;
      render(false);
      return;
    }

    const voteButton = target.closest<HTMLButtonElement>('[data-vote]');
    if (voteButton?.dataset.vote) { void toggleVote(voteButton.dataset.vote, voteButton); return; }

    const saveButton = target.closest<HTMLButtonElement>('[data-save]');
    if (saveButton?.dataset.save) { toggleSave(saveButton.dataset.save); return; }
    const detailsButton = target.closest<HTMLButtonElement>('[data-details]');
    const product = products.find(item => item.id === detailsButton?.dataset.details);
    if (product) openModal(product);
  });

  modal.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    if (target.closest('[data-product-close]')) { closeModal(); return; }
    const saveButton = target.closest<HTMLButtonElement>('[data-modal-save]');
    if (saveButton?.dataset.modalSave) toggleSave(saveButton.dataset.modalSave);
  });

  // Wrapped: render takes a reset flag, and passing it straight to
  // addEventListener would hand it the Event object as that flag.
  search?.addEventListener('input', () => render());
  sort?.addEventListener('change', () => render());
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
      renderNewBanner();
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
