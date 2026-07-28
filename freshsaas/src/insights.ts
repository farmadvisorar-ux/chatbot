import './insights.css';
import { api } from './api-client';
import { escapeHtml } from './escape-html';
import { track, trackSearch } from './analytics';

type Link = { name: string; url: string; note: string; sponsored: boolean };
type Article = {
    slug: string; title: string; keyword: string; metaDescription: string;
    category: string; excerpt: string; bodyHtml: string; readMinutes: number;
    updatedAt: string; links: Link[]; disclosure: string | null;
};

const list = document.querySelector<HTMLElement>('#ins-list');
const detail = document.querySelector<HTMLElement>('#ins-article');
const search = document.querySelector<HTMLInputElement>('#ins-search');
const categoryBar = document.querySelector<HTMLElement>('#ins-categories');
const countLabel = document.querySelector<HTMLElement>('#ins-count');
const year = document.querySelector<HTMLElement>('#ins-year');

if (year) year.textContent = String(new Date().getFullYear());

let articles: Article[] = [];
let category = 'All';

const dateLabel = (iso: string): string =>
    new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

/**
 * Affiliate links must be marked `sponsored` and must not pass ranking signal.
 * Google treats undisclosed paid links as a manual-action risk, so this is not
 * optional dressing — it is what keeps the whole Insights section safe to
 * monetise.
 */
const linkRel = (sponsored: boolean): string =>
    sponsored ? 'sponsored nofollow noopener noreferrer' : 'noopener noreferrer';

function linkList(article: Article): string {
    if (!article.links.length) return '';
    const items = article.links.map(link => `
        <li>
            <a href="${escapeHtml(link.url)}" target="_blank" rel="${linkRel(link.sponsored)}"
               data-outbound="${escapeHtml(article.slug)}">${escapeHtml(link.name)}</a>
            ${link.note ? `<span>${escapeHtml(link.note)}</span>` : ''}
            ${link.sponsored ? '<em class="ins-sponsored">sponsored</em>' : ''}
        </li>`).join('');
    const hasSponsored = article.links.some(link => link.sponsored);
    return `
        <aside class="ins-links">
            <h2>Tools mentioned in this guide</h2>
            <ul>${items}</ul>
            ${hasSponsored ? '<p class="ins-disclosure">Some links above are affiliate links. If you sign up through them FreshSAAS may earn a commission, at no extra cost to you. It does not affect what we recommend or the order things appear in.</p>' : ''}
        </aside>`;
}

function cardMarkup(article: Article): string {
    return `
        <article class="ins-card">
            <span class="ins-card-cat">${escapeHtml(article.category)} · ${article.readMinutes} min read</span>
            <h2><a href="#${escapeHtml(article.slug)}" data-open="${escapeHtml(article.slug)}">${escapeHtml(article.title)}</a></h2>
            <p>${escapeHtml(article.excerpt)}</p>
            <div class="ins-card-foot">
                <span class="ins-keyword">${escapeHtml(article.keyword)}</span>
                <a class="ins-read" href="#${escapeHtml(article.slug)}" data-open="${escapeHtml(article.slug)}">Read guide →</a>
            </div>
        </article>`;
}

function renderList(): void {
    if (!list) return;
    const query = search?.value.trim().toLowerCase() || '';
    const visible = articles.filter(article => {
        const haystack = [article.title, article.excerpt, article.keyword, article.category,
            ...article.links.map(l => l.name)].join(' ').toLowerCase();
        return (category === 'All' || article.category === category) && (!query || haystack.includes(query));
    });

    if (countLabel) countLabel.textContent = `${visible.length} guide${visible.length === 1 ? '' : 's'}`;
    list.innerHTML = visible.length
        ? visible.map(cardMarkup).join('')
        : '<p class="ins-empty">No guides match that search yet.</p>';
}

function renderCategories(): void {
    if (!categoryBar) return;
    const names = ['All', ...Array.from(new Set(articles.map(a => a.category))).sort()];
    categoryBar.innerHTML = names.map(name =>
        `<button type="button" class="ins-chip${name === category ? ' active' : ''}" data-category="${escapeHtml(name)}">${escapeHtml(name)}</button>`).join('');
}

function showArticle(slug: string): void {
    const article = articles.find(item => item.slug === slug);
    if (!article || !detail || !list) return;

    document.title = `${article.title} | FreshSAAS Insights`;
    document.querySelector('meta[name="description"]')?.setAttribute('content', article.metaDescription);
    document.querySelector('link[rel="canonical"]')?.setAttribute('href', `https://freshsaas.online/insights.html#${article.slug}`);

    // bodyHtml is authored in this repo and seeded from it — it is not user
    // input, which is why it can be injected as markup here.
    detail.innerHTML = `
        <a class="ins-back" href="#" data-back>← All guides</a>
        <span class="ins-card-cat">${escapeHtml(article.category)} · ${article.readMinutes} min read</span>
        <h1>${escapeHtml(article.title)}</h1>
        <p class="ins-standfirst">${escapeHtml(article.excerpt)}</p>
        <p class="ins-byline">Updated ${escapeHtml(dateLabel(article.updatedAt))}</p>
        ${article.disclosure ? `<p class="ins-ownership"><strong>Disclosure:</strong> ${escapeHtml(article.disclosure)}</p>` : ''}
        <div class="ins-body">${article.bodyHtml}</div>
        ${linkList(article)}
        <a class="ins-back" href="#" data-back>← All guides</a>`;

    detail.hidden = false;
    list.hidden = true;
    document.querySelector<HTMLElement>('.ins-controls')!.hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    track('pageview', { path: `/insights.html#${article.slug}` });
}

function showList(): void {
    if (!detail || !list) return;
    detail.hidden = true;
    detail.innerHTML = '';
    list.hidden = false;
    document.querySelector<HTMLElement>('.ins-controls')!.hidden = false;
    document.title = "SaaS Insights — Buyer's Guides and Tool Comparisons | FreshSAAS";
}

function routeFromHash(): void {
    const slug = location.hash.replace(/^#/, '');
    if (slug && articles.some(a => a.slug === slug)) showArticle(slug);
    else showList();
}

document.addEventListener('click', event => {
    const target = event.target as HTMLElement;

    const open = target.closest<HTMLElement>('[data-open]');
    if (open) {
        event.preventDefault();
        location.hash = open.dataset.open!;
        return;
    }
    if (target.closest('[data-back]')) {
        event.preventDefault();
        history.pushState('', '', location.pathname);
        showList();
        return;
    }
    const chip = target.closest<HTMLElement>('[data-category]');
    if (chip) {
        category = chip.dataset.category!;
        renderCategories();
        renderList();
        return;
    }
    const outbound = target.closest<HTMLAnchorElement>('[data-outbound]');
    if (outbound) {
        track('outbound', { label: `insights:${outbound.textContent?.trim().slice(0, 100)}` });
    }
});

window.addEventListener('hashchange', routeFromHash);
search?.addEventListener('input', () => renderList());
if (search) search.addEventListener('input', trackSearch(() => search.value));

(async () => {
    try {
        const response = await api.get<{ articles: Article[] }>('/api/directory?view=insights');
        articles = response.data?.articles ?? [];
        renderCategories();
        renderList();
        routeFromHash();
    } catch {
        // The prerendered markup is already in the page, so a failed fetch
        // leaves readable content rather than an empty screen.
        if (list && !list.children.length) {
            list.innerHTML = '<p class="ins-empty">Guides could not be loaded. Please refresh.</p>';
        }
    }
})();

track('pageview');
