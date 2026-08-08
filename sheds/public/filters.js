/*
 * Catalogue filtering, entirely client-side.
 *
 * All 198 buildings are in the HTML the server sent, so this script only ever
 * hides and reorders nodes that are already on the page. That is what makes
 * filtering feel instant — there is no request, no spinner, and no second
 * copy of the catalogue downloaded as JSON — and it is also why the page is
 * fully usable if this file never loads: without it you get every building,
 * which is a worse experience but not a broken one.
 *
 * The facets are read from data-* attributes written at build time, so this
 * file knows nothing about sheds and does not need changing when the
 * catalogue does.
 */
(() => {
    const form = document.getElementById('filters');
    const grid = document.getElementById('grid');
    const count = document.getElementById('count');
    const empty = document.getElementById('empty');
    const sort = document.getElementById('sort');
    const price = document.getElementById('price');
    const priceOut = document.getElementById('price-out');
    if (!form || !grid || !count) return;

    const cards = [...grid.children];
    const money = (cents) => `$${Math.round(cents / 100).toLocaleString('en-US')}`;

    const checked = (name) =>
        new Set([...form.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value));

    function apply() {
        const types = checked('type');
        const widths = checked('width');
        const sidings = checked('siding');
        const features = checked('feature');
        const maxPrice = price ? Number(price.value) : Infinity;

        let shown = 0;
        for (const card of cards) {
            const d = card.dataset;
            const cardFeatures = d.features ? d.features.split('|') : [];
            const ok =
                (types.size === 0 || types.has(d.type))
                && (widths.size === 0 || widths.has(d.width))
                && (sidings.size === 0 || sidings.has(d.siding))
                // "Must have" is an AND: someone who ticks Porch and Loft
                // wants both, not either. Ticking two things and getting more
                // results than one thing is the classic broken filter.
                && [...features].every((f) => cardFeatures.includes(f))
                && Number(d.price) <= maxPrice;

            card.hidden = !ok;
            if (ok) shown++;
        }

        count.textContent = shown === 1 ? '1 building' : `${shown} buildings`;
        if (empty) empty.hidden = shown !== 0;
    }

    function applySort() {
        const [key, dir] = (sort?.value ?? 'price-asc').split('-');
        const field = key === 'price' ? 'price' : 'sqft';
        const sign = dir === 'asc' ? 1 : -1;
        const ordered = [...cards].sort(
            (a, b) => sign * (Number(a.dataset[field]) - Number(b.dataset[field])),
        );
        // One reflow rather than 198: the fragment is assembled off-document
        // and swapped in once.
        const frag = document.createDocumentFragment();
        for (const c of ordered) frag.appendChild(c);
        grid.appendChild(frag);
    }

    form.addEventListener('change', apply);
    form.addEventListener('reset', () => {
        // Reset fires before the controls are actually cleared.
        requestAnimationFrame(() => {
            if (price) { price.value = price.max; priceOut.textContent = money(Number(price.max)); }
            apply();
        });
    });

    if (price && priceOut) {
        price.addEventListener('input', () => {
            priceOut.textContent = money(Number(price.value));
            apply();
        });
    }

    sort?.addEventListener('change', applySort);
    document.getElementById('clear2')?.addEventListener('click', () => form.reset());

    /*
     * The homepage links to /buildings.html#type=garage. Honouring that hash
     * means a category tile lands on a filtered list rather than on the full
     * catalogue with the filter merely highlighted, which is the difference
     * between the tile working and the tile lying.
     */
    const hash = new URLSearchParams(location.hash.slice(1));
    let preset = false;
    for (const [name, value] of hash) {
        const input = form.querySelector(`input[name="${name}"][value="${CSS.escape(value)}"]`);
        if (input) { input.checked = true; preset = true; }
    }
    if (preset) apply();
})();
