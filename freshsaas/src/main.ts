import './styles.css';
import { api } from './api-client';
import { track, trackSearch } from './analytics';
import { initDirectory } from './directory';
import { mountAIWorkspace } from './ai-workspace';
import { mountMarketplace } from './marketplace';
import { mountAds } from './ads';
import { escapeHtml } from './escape-html';
import { initAuth } from './auth';
import { createIcons, ArrowRight, Sparkles, Rocket, Search, CheckCircle2, Layers3, Zap, Globe2, Menu, X, BadgeCheck, Mail, Plus, Building2, CircleDollarSign, FileQuestion, ClipboardList } from 'lucide';
// Imported last on purpose. Vite emits bundled CSS in module-graph order, and
// the modules above ship their own sheets (ai-workspace.css and friends), so
// the theme layer only overrides them if it comes after.
import './theme-dark.css';

createIcons({ icons: { ArrowRight, Sparkles, Rocket, Search, CheckCircle2, Layers3, Zap, Globe2, Menu, X, BadgeCheck, Mail, Plus, Building2, CircleDollarSign, FileQuestion, ClipboardList } });

const body = document.body;
const menuButton = document.querySelector<HTMLButtonElement>('.menu-button');
const mobileNav = document.querySelector<HTMLElement>('.mobile-nav');
const modal = document.querySelector<HTMLElement>('#submit-modal');
const submitForm = document.querySelector<HTMLFormElement>('#submit-form');
const submitStatus = document.querySelector<HTMLElement>('#submit-status');
const signupForm = document.querySelector<HTMLFormElement>('#signup-form');
const signupEmail = document.querySelector<HTMLInputElement>('#signup-email');
const signupStatus = document.querySelector<HTMLElement>('#signup-status');
const toast = document.querySelector<HTMLElement>('#toast');
const year = document.querySelector<HTMLElement>('#year');
const projectModal = document.querySelector<HTMLElement>('#project-modal');
const projectForm = document.querySelector<HTMLFormElement>('#project-form');
const projectStatus = document.querySelector<HTMLElement>('#project-status');
const projectList = document.querySelector<HTMLElement>('#project-list');
const projectFilter = document.querySelector<HTMLSelectElement>('#project-filter');

type Project = { id: string; name: string; customer: string; value: number; status: string; progress: number; rfis: number; changes: number; createdAt: string };
let projects: Project[] = [];

if (year) year.textContent = String(new Date().getFullYear());

const closeMenu = (): void => { menuButton?.classList.remove('is-open'); mobileNav?.classList.remove('is-open'); menuButton?.setAttribute('aria-expanded', 'false'); };
menuButton?.addEventListener('click', () => {
    const open = !menuButton.classList.contains('is-open');
    menuButton.classList.toggle('is-open', open);
    mobileNav?.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
});
document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach(link => link.addEventListener('click', closeMenu));

const openModal = (element: HTMLElement | null): void => {
    element?.classList.add('is-open');
    element?.setAttribute('aria-hidden', 'false');
    body.style.overflow = 'hidden';
    setTimeout(() => element?.querySelector<HTMLInputElement>('input')?.focus(), 50);
};
const closeModal = (element: HTMLElement | null): void => {
    element?.classList.remove('is-open');
    element?.setAttribute('aria-hidden', 'true');
    body.style.overflow = '';
};

document.querySelectorAll<HTMLElement>('[data-submit]').forEach(button => button.addEventListener('click', () => openModal(modal)));
document.querySelectorAll<HTMLElement>('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(modal)));
document.querySelector('#new-project-button')?.addEventListener('click', () => openModal(projectModal));
document.querySelectorAll<HTMLElement>('[data-close-project]').forEach(button => button.addEventListener('click', () => closeModal(projectModal)));
document.addEventListener('keydown', event => { if (event.key === 'Escape') { closeModal(modal); closeModal(projectModal); } });

submitForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!submitForm.checkValidity()) { submitForm.reportValidity(); return; }
    const button = submitForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const payload = Object.fromEntries(new FormData(submitForm).entries());
    if (button) { button.disabled = true; button.textContent = 'Sending submission…'; }
    try {
        await api.post('/api/project-submissions', payload);
        if (submitStatus) { submitStatus.textContent = 'Project submitted successfully. We received it for review.'; submitStatus.className = 'form-status success'; }
        submitForm.reset();
    } catch (err) {
        if (submitStatus) { submitStatus.textContent = err instanceof Error ? err.message : 'We could not send your project. Please try again.'; submitStatus.className = 'form-status error'; }
    } finally {
        if (button) { button.disabled = false; button.innerHTML = 'Send submission <i data-lucide="arrow-right"></i>'; createIcons({ icons: { ArrowRight } }); }
    }
});

signupForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!signupEmail?.checkValidity()) { signupEmail?.reportValidity(); return; }
    const button = signupForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) { button.disabled = true; button.textContent = 'Joining…'; }
    try {
        const response = await api.post<{ alreadyJoined: boolean }>('/api/waitlist', { email: signupEmail.value.trim() });
        if (signupStatus) {
            signupStatus.textContent = response.data?.alreadyJoined ? 'You are already on the FreshSAAS launch list.' : 'You are in. Your email was added to the FreshSAAS launch list.';
            signupStatus.className = 'form-status success';
        }
        signupEmail.value = '';
    } catch (err) {
        if (signupStatus) { signupStatus.textContent = err instanceof Error ? err.message : 'We could not add your email right now.'; signupStatus.className = 'form-status error'; }
    } finally {
        if (button) { button.disabled = false; button.innerHTML = 'Join the list <i data-lucide="arrow-right"></i>'; createIcons({ icons: { ArrowRight } }); }
    }
});

const money = (value: number): string => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);

const renderProjects = (): void => {
    const filter = projectFilter?.value || 'all';
    const visible = filter === 'all' ? projects : projects.filter(item => item.status === filter);
    if (projectList) {
        projectList.innerHTML = visible.length
            ? visible.map(project => `<article class="project-row"><div class="project-symbol"><i data-lucide="building-2"></i></div><div class="project-main"><div><strong>${escapeHtml(project.name)}</strong><span>${escapeHtml(project.customer)}</span></div><div class="project-progress"><span style="width:${project.progress}%"></span></div><small>${project.progress}% complete · ${project.rfis} RFIs · ${project.changes} changes</small></div><div class="project-value"><span class="status status-${escapeHtml(project.status.toLowerCase())}">${escapeHtml(project.status)}</span><strong>${money(project.value)}</strong></div></article>`).join('')
            : '<p class="ops-empty">No projects match this view.</p>';
    }
    document.querySelector('#metric-active')!.textContent = String(projects.filter(item => item.status === 'Active').length);
    document.querySelector('#metric-value')!.textContent = money(projects.reduce((sum, item) => sum + item.value, 0));
    document.querySelector('#metric-rfis')!.textContent = String(projects.reduce((sum, item) => sum + item.rfis, 0));
    document.querySelector('#metric-changes')!.textContent = String(projects.reduce((sum, item) => sum + item.changes, 0));
    createIcons({ icons: { Building2 } });
};

const loadProjects = async (): Promise<void> => {
    try {
        const response = await api.get<{ projects: Project[] }>('/api/construction-projects');
        projects = response.data?.projects || [];
        renderProjects();
    } catch {
        if (projectList) projectList.innerHTML = '<p class="ops-empty error">Projects could not be loaded.</p>';
    }
};
projectFilter?.addEventListener('change', renderProjects);

projectForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!projectForm.checkValidity()) { projectForm.reportValidity(); return; }
    const button = projectForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const form = Object.fromEntries(new FormData(projectForm).entries());
    if (button) { button.disabled = true; button.textContent = 'Saving…'; }
    try {
        const response = await api.post<{ project: Project }>('/api/construction-projects', form);
        projects = [response.data.project, ...projects];
        renderProjects();
        projectForm.reset();
        if (projectStatus) { projectStatus.textContent = 'Project saved to the working portfolio.'; projectStatus.className = 'form-status success'; }
        setTimeout(() => closeModal(projectModal), 700);
    } catch (err) {
        if (projectStatus) { projectStatus.textContent = err instanceof Error ? err.message : 'Project could not be saved.'; projectStatus.className = 'form-status error'; }
    } finally {
        if (button) { button.disabled = false; button.innerHTML = 'Save project <i data-lucide="arrow-right"></i>'; createIcons({ icons: { ArrowRight } }); }
    }
});

let toastTimer = 0;
document.querySelectorAll<HTMLButtonElement>('.preview-action').forEach(button => button.addEventListener('click', () => {
    document.querySelector('#launch-directory')?.scrollIntoView({ behavior: 'smooth' });
    if (!toast) return;
    toast.textContent = 'Opening the live launch directory.';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 2200);
}));

const observer = new IntersectionObserver(entries => entries.forEach(entry => {
    if (entry.isIntersecting) { entry.target.classList.add('visible'); observer.unobserve(entry.target); }
}), { threshold: .12 });
document.querySelectorAll<HTMLElement>('.reveal').forEach(element => observer.observe(element));

initAuth();
initDirectory();
loadProjects();
mountAIWorkspace();
mountMarketplace();
mountAds();

track('pageview');
document.querySelectorAll<HTMLElement>('[data-submit]').forEach(button =>
    button.addEventListener('click', () => track('submit_open')));
document.querySelector('#signup-form')?.addEventListener('submit', () => track('signup_open'));

// Directory and marketplace are rendered after mount, so listen on the
// document rather than binding to elements that don't exist yet.
document.addEventListener('click', event => {
    const target = event.target as HTMLElement;
    const details = target.closest<HTMLElement>('[data-details]');
    if (details) {
        const card = details.closest<HTMLElement>('.directory-card');
        track('listing_click', { label: card?.querySelector('h3')?.textContent?.slice(0, 120) ?? undefined });
        return;
    }
    const link = target.closest<HTMLAnchorElement>('a[target="_blank"]');
    if (link?.href && !link.href.includes(location.host)) {
        track('outbound', { label: link.closest('.directory-card, .product-modal-card')?.querySelector('h3, h2')?.textContent?.slice(0, 120) ?? new URL(link.href).hostname });
    }
});
const directorySearch = document.querySelector<HTMLInputElement>('#directory-search');
if (directorySearch) directorySearch.addEventListener('input', trackSearch(() => directorySearch.value));
