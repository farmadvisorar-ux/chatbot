/**
 * Fades/slides [data-reveal] elements in as they enter the viewport. Content
 * is visible by default in CSS — only elements this function actually arms
 * with `.pre-reveal` can go transparent, so a JS failure never leaves
 * pricing cards or features permanently invisible.
 */
export function initScrollReveal(root: ParentNode = document): void {
    const items = root.querySelectorAll<HTMLElement>('[data-reveal]');
    if (!items.length) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof IntersectionObserver === 'undefined') {
        return;
    }

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (entry.isIntersecting) {
                entry.target.classList.add('in-view');
                observer.unobserve(entry.target);
            }
        }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    items.forEach(el => {
        el.classList.add('pre-reveal');
        observer.observe(el);
    });
}
