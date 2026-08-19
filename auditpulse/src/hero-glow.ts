/** Cursor-reactive glow behind the hero — desktop pointers only, off under reduced motion. */
export function initHeroGlow(): void {
    const hero = document.querySelector<HTMLElement>('.hero');
    if (!hero) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(pointer: coarse)').matches) return;

    hero.addEventListener('pointermove', event => {
        const rect = hero.getBoundingClientRect();
        hero.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        hero.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
}
