import './ai-workspace.css';
import { createIcons, Bot, Search, ShieldCheck, Settings, X, Check, Ban, Plus, KeyRound, Sparkles, ArrowRight } from 'lucide';
import { products, type Product } from './catalog';
import { escapeHtml } from './escape-html';

type Tab = 'search' | 'provider' | 'approvals';
type ProposalStatus = 'pending' | 'approved' | 'rejected';
type Proposal = { id: string; title: string; detail: string; status: ProposalStatus; createdAt: string };
type ProviderProfile = { provider: string; model: string; endpoint: string; approvalGate: true };

const PROFILE_KEY = 'freshsaas_ai_profile';
const PROPOSALS_KEY = 'freshsaas_ai_proposals';
const cloudProviders = ['OpenAI', 'Anthropic', 'Gemini', 'Groq', 'xAI', 'Mistral', 'OpenRouter'];
const localProviders = ['Ollama', 'LM Studio', 'Self-hosted'];
const stopWords = new Set(['a','an','and','are','for','find','give','i','in','is','me','of','on','show','that','the','to','tools','with']);
const aliases: Record<string, string> = { builders: 'construction', building: 'construction', money: 'finance', salespeople: 'sales', marketers: 'marketing', agents: 'ai', automation: 'workflow' };

const readJson = <T>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || '') as T; } catch { return fallback; } };
const writeJson = (key: string, value: unknown): void => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Browser storage can be unavailable. */ } };
const defaultProposals = (): Proposal[] => [
  { id: 'weekly-digest', title: 'Prepare a weekly launch intelligence digest', detail: 'Draft a review-ready summary of the newest products, categories, and notable trends. No message is sent automatically.', status: 'pending', createdAt: new Date().toISOString() },
  { id: 'catalog-enrichment', title: 'Review catalog enrichment for 25 launches', detail: 'Prepare suggested audience and use-case tags for operator review before any catalog change is made.', status: 'pending', createdAt: new Date().toISOString() }
];

const scoreProduct = (product: Product, query: string): number => {
  const normalizedQuery = query.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const terms = normalizedQuery.split(' ').filter(term => term && !stopWords.has(term)).map(term => aliases[term] || term);
  if (!terms.length) return 0;
  const name = product.name.toLowerCase();
  const category = product.category.toLowerCase();
  const tags = product.tags.join(' ').toLowerCase();
  const tagline = product.tagline.toLowerCase();
  const audience = product.audience.toLowerCase();
  const description = product.description.toLowerCase();
  let score = name.includes(normalizedQuery) ? 18 : 0;
  terms.forEach(term => {
    if (name.includes(term)) score += 7;
    if (category.includes(term)) score += 6;
    if (tags.includes(term)) score += 5;
    if (tagline.includes(term)) score += 4;
    if (audience.includes(term)) score += 3;
    if (description.includes(term)) score += 2;
  });
  return score;
};

const searchCatalog = (query: string): Array<{ product: Product; score: number }> => products
  .map(product => ({ product, score: scoreProduct(product, query) }))
  .filter(result => result.score > 0)
  .sort((a, b) => b.score - a.score || b.product.freshness - a.product.freshness)
  .slice(0, 8);

export function mountAIWorkspace(): void {
  if (document.querySelector('#ai-workspace')) return;

  const launcher = document.createElement('button');
  launcher.id = 'ai-workspace-launcher';
  launcher.className = 'aiw-launcher';
  launcher.type = 'button';
  launcher.innerHTML = '<i data-lucide="bot"></i><span>AI Workspace</span><small>Phase 17.1</small>';
  document.body.appendChild(launcher);

  const workspace = document.createElement('div');
  workspace.id = 'ai-workspace';
  workspace.className = 'aiw-shell';
  workspace.setAttribute('aria-hidden', 'true');
  workspace.innerHTML = `
    <div class="aiw-backdrop" data-ai-close></div>
    <aside class="aiw-panel" role="dialog" aria-modal="true" aria-labelledby="aiw-title">
      <header class="aiw-header">
        <div><span class="aiw-kicker"><i data-lucide="sparkles"></i> Phase 17.1</span><h2 id="aiw-title">AI Workspace</h2><p>Customer-owned AI, zero token markup, and no action without approval.</p></div>
        <button class="aiw-icon-button" type="button" aria-label="Close AI Workspace" data-ai-close><i data-lucide="x"></i></button>
      </header>
      <div class="aiw-guardrail">
        <div><strong>$0</strong><span>FreshSAAS token markup</span></div>
        <div><strong>Off</strong><span>Automatic execution</span></div>
        <div><strong>On</strong><span>Human approval gate</span></div>
      </div>
      <nav class="aiw-tabs" aria-label="AI Workspace sections">
        <button type="button" class="active" data-ai-tab="search"><i data-lucide="search"></i> Smart search</button>
        <button type="button" data-ai-tab="provider"><i data-lucide="settings"></i> Provider</button>
        <button type="button" data-ai-tab="approvals"><i data-lucide="shield-check"></i> Approvals <span id="aiw-pending-count">0</span></button>
      </nav>
      <section class="aiw-view active" data-ai-view="search">
        <div class="aiw-section-head"><div><h3>Ask the catalog</h3><p>Plain-language discovery runs locally against the FreshSAAS catalog. It uses no model tokens.</p></div><span class="aiw-local-badge">Zero-token search</span></div>
        <form id="aiw-search-form" class="aiw-search-form">
          <label><span class="sr-only">Ask the FreshSAAS catalog</span><input id="aiw-search-input" type="search" required placeholder="Example: Show me AI tools for construction teams"></label>
          <button type="submit"><i data-lucide="search"></i> Search</button>
        </form>
        <div id="aiw-search-status" class="aiw-status" aria-live="polite">Try a natural-language request to rank matching launches.</div>
        <div id="aiw-results" class="aiw-results"></div>
      </section>
      <section class="aiw-view" data-ai-view="provider">
        <div class="aiw-section-head"><div><h3>Bring your own AI</h3><p>Choose a provider and model. FreshSAAS does not buy, resell, or mark up model usage.</p></div><i data-lucide="key-round"></i></div>
        <form id="aiw-provider-form" class="aiw-provider-form">
          <label>Provider<select id="aiw-provider" name="provider">${[...cloudProviders, ...localProviders].map(provider => `<option>${provider}</option>`).join('')}</select></label>
          <label>Model<input id="aiw-model" name="model" required placeholder="Example: gpt-5 or claude-sonnet"></label>
          <label>Endpoint <span>Required for local or self-hosted providers</span><input id="aiw-endpoint" name="endpoint" type="url" placeholder="http://localhost:11434"></label>
          <label>Session credential <span>Never stored in the catalog or browser storage</span><input id="aiw-key" name="key" type="password" autocomplete="off" placeholder="Enter a provider key for this session"></label>
          <div class="aiw-approval-lock"><i data-lucide="shield-check"></i><div><strong>Approval gate locked on</strong><span>Provider setup cannot enable autonomous actions.</span></div></div>
          <button class="aiw-primary" type="submit">Save connection profile <i data-lucide="arrow-right"></i></button>
          <p id="aiw-provider-status" class="aiw-status" aria-live="polite"></p>
        </form>
      </section>
      <section class="aiw-view" data-ai-view="approvals">
        <div class="aiw-section-head"><div><h3>Human approval queue</h3><p>Ideas may be prepared, but nothing is executed until a person makes an explicit decision.</p></div><span class="aiw-local-badge">Operator controlled</span></div>
        <form id="aiw-proposal-form" class="aiw-proposal-form"><input id="aiw-proposal-title" required maxlength="120" placeholder="Describe an action for review"><button type="submit"><i data-lucide="plus"></i> Add</button></form>
        <p id="aiw-approval-status" class="aiw-status" aria-live="polite"></p>
        <div id="aiw-proposals" class="aiw-proposals"></div>
      </section>
    </aside>`;
  document.body.appendChild(workspace);

  const panel = workspace.querySelector<HTMLElement>('.aiw-panel');
  const tabs = Array.from(workspace.querySelectorAll<HTMLButtonElement>('[data-ai-tab]'));
  const views = Array.from(workspace.querySelectorAll<HTMLElement>('[data-ai-view]'));
  const searchForm = workspace.querySelector<HTMLFormElement>('#aiw-search-form');
  const searchInput = workspace.querySelector<HTMLInputElement>('#aiw-search-input');
  const searchStatus = workspace.querySelector<HTMLElement>('#aiw-search-status');
  const results = workspace.querySelector<HTMLElement>('#aiw-results');
  const providerForm = workspace.querySelector<HTMLFormElement>('#aiw-provider-form');
  const providerSelect = workspace.querySelector<HTMLSelectElement>('#aiw-provider');
  const modelInput = workspace.querySelector<HTMLInputElement>('#aiw-model');
  const endpointInput = workspace.querySelector<HTMLInputElement>('#aiw-endpoint');
  const keyInput = workspace.querySelector<HTMLInputElement>('#aiw-key');
  const providerStatus = workspace.querySelector<HTMLElement>('#aiw-provider-status');
  const proposalForm = workspace.querySelector<HTMLFormElement>('#aiw-proposal-form');
  const proposalTitle = workspace.querySelector<HTMLInputElement>('#aiw-proposal-title');
  const proposalsWrap = workspace.querySelector<HTMLElement>('#aiw-proposals');
  const approvalStatus = workspace.querySelector<HTMLElement>('#aiw-approval-status');
  const pendingCount = workspace.querySelector<HTMLElement>('#aiw-pending-count');
  let currentTab: Tab = 'search';
  let proposals = readJson<Proposal[]>(PROPOSALS_KEY, defaultProposals());
  if (!Array.isArray(proposals) || !proposals.length) proposals = defaultProposals();

  const renderIcons = (): void => createIcons({ icons: { Bot, Search, ShieldCheck, Settings, X, Check, Ban, Plus, KeyRound, Sparkles, ArrowRight } });
  const openWorkspace = (): void => { workspace.classList.add('open'); workspace.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden'; setTimeout(() => panel?.focus(), 20); };
  const closeWorkspace = (): void => { workspace.classList.remove('open'); workspace.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; };
  const setTab = (tab: Tab): void => {
    currentTab = tab;
    tabs.forEach(button => button.classList.toggle('active', button.dataset.aiTab === tab));
    views.forEach(view => view.classList.toggle('active', view.dataset.aiView === tab));
    if (tab === 'search') setTimeout(() => searchInput?.focus(), 30);
    if (tab === 'approvals') renderProposals();
  };

  const addProposal = (title: string, detail: string): void => {
    proposals = [{ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, title, detail, status: 'pending', createdAt: new Date().toISOString() }, ...proposals];
    writeJson(PROPOSALS_KEY, proposals);
    renderProposals();
  };

  const renderResults = (query: string): void => {
    if (!results || !searchStatus) return;
    const matches = searchCatalog(query);
    searchStatus.textContent = matches.length ? `${matches.length} ranked match${matches.length === 1 ? '' : 'es'} found without using AI tokens.` : 'No strong match yet. Try a category, audience, or business problem.';
    searchStatus.className = `aiw-status ${matches.length ? 'success' : 'warning'}`;
    results.innerHTML = matches.map(({ product, score }) => `<article class="aiw-result"><div class="aiw-result-logo" style="background:${escapeHtml(product.accent)}">${escapeHtml(product.initials)}</div><div><span>${escapeHtml(product.category)} · relevance ${score}</span><h4>${escapeHtml(product.name)}</h4><p>${escapeHtml(product.tagline)}</p><div class="aiw-result-actions"><a href="${escapeHtml(product.url)}" target="_blank" rel="noopener noreferrer">View launch <i data-lucide="arrow-right"></i></a><button type="button" data-ai-propose="${escapeHtml(product.id)}">Queue review</button></div></div></article>`).join('');
    renderIcons();
  };

  function renderProposals(): void {
    if (!proposalsWrap || !pendingCount) return;
    pendingCount.textContent = String(proposals.filter(proposal => proposal.status === 'pending').length);
    proposalsWrap.innerHTML = proposals.map(proposal => `<article class="aiw-proposal status-${proposal.status}"><div class="aiw-proposal-top"><span>${proposal.status}</span><time>${new Date(proposal.createdAt).toLocaleDateString('en-US')}</time></div><h4>${escapeHtml(proposal.title)}</h4><p>${escapeHtml(proposal.detail)}</p>${proposal.status === 'pending' ? `<div class="aiw-decision-row"><button type="button" class="approve" data-ai-decision="approved" data-ai-id="${escapeHtml(proposal.id)}"><i data-lucide="check"></i> Approve</button><button type="button" class="reject" data-ai-decision="rejected" data-ai-id="${escapeHtml(proposal.id)}"><i data-lucide="ban"></i> Reject</button></div>` : '<div class="aiw-decision-note">Decision recorded. No automatic execution was started.</div>'}</article>`).join('');
    renderIcons();
  }

  const profile = readJson<ProviderProfile | null>(PROFILE_KEY, null);
  if (profile && providerSelect && modelInput && endpointInput) { providerSelect.value = profile.provider; modelInput.value = profile.model; endpointInput.value = profile.endpoint; }

  launcher.addEventListener('click', openWorkspace);
  workspace.addEventListener('click', event => { if ((event.target as HTMLElement).closest('[data-ai-close]')) closeWorkspace(); });
  tabs.forEach(button => button.addEventListener('click', () => setTab((button.dataset.aiTab || 'search') as Tab)));
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && workspace.classList.contains('open')) closeWorkspace(); });

  searchForm?.addEventListener('submit', event => { event.preventDefault(); const query = searchInput?.value.trim() || ''; if (!query) { searchStatus!.textContent = 'Enter a question or search phrase first.'; searchStatus!.className = 'aiw-status error'; return; } renderResults(query); });
  results?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ai-propose]');
    const product = products.find(item => item.id === button?.dataset.aiPropose);
    if (!product) return;
    addProposal(`Review ${product.name} for featured placement`, `Evaluate ${product.name} against FreshSAAS quality standards before changing its catalog placement.`);
    if (approvalStatus) { approvalStatus.textContent = `${product.name} was added to the approval queue.`; approvalStatus.className = 'aiw-status success'; }
    setTab('approvals');
  });

  providerForm?.addEventListener('submit', event => {
    event.preventDefault();
    if (!providerSelect || !modelInput || !endpointInput || !keyInput || !providerStatus) return;
    const provider = providerSelect.value;
    const model = modelInput.value.trim();
    const endpoint = endpointInput.value.trim();
    const key = keyInput.value.trim();
    if (!model) { providerStatus.textContent = 'Enter the model you plan to use.'; providerStatus.className = 'aiw-status error'; return; }
    if (cloudProviders.includes(provider) && key.length < 8) { providerStatus.textContent = 'Enter a provider credential for this session. It will not be stored.'; providerStatus.className = 'aiw-status error'; return; }
    if (localProviders.includes(provider) && !endpoint) { providerStatus.textContent = 'Enter the local or self-hosted endpoint.'; providerStatus.className = 'aiw-status error'; return; }
    writeJson(PROFILE_KEY, { provider, model, endpoint, approvalGate: true } satisfies ProviderProfile);
    keyInput.value = '';
    providerStatus.textContent = 'Connection profile saved. The credential was cleared, never uploaded, and never stored. Live model calls remain disabled until the secure server-side handoff phase.';
    providerStatus.className = 'aiw-status success';
  });

  proposalForm?.addEventListener('submit', event => {
    event.preventDefault();
    const title = proposalTitle?.value.trim() || '';
    if (!title) return;
    addProposal(title, 'Operator-created proposal. Approval records the decision but does not execute the action.');
    if (proposalTitle) proposalTitle.value = '';
    if (approvalStatus) { approvalStatus.textContent = 'Proposal added for human review.'; approvalStatus.className = 'aiw-status success'; }
  });

  proposalsWrap?.addEventListener('click', event => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-ai-decision]');
    const id = button?.dataset.aiId;
    const decision = button?.dataset.aiDecision as ProposalStatus | undefined;
    if (!id || !decision) return;
    proposals = proposals.map(proposal => proposal.id === id ? { ...proposal, status: decision } : proposal);
    writeJson(PROPOSALS_KEY, proposals);
    if (approvalStatus) { approvalStatus.textContent = decision === 'approved' ? 'Approved. The decision is recorded, but execution remains off.' : 'Rejected. The proposal will not run.'; approvalStatus.className = `aiw-status ${decision === 'approved' ? 'success' : 'warning'}`; }
    renderProposals();
  });

  renderProposals();
  setTab(currentTab);
  renderIcons();
}
