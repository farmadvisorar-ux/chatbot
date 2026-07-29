export type BillingInterval = 'month' | 'year';

const PRICES: Record<string, { monthly: number; annual: number }> = {
    audit: { monthly: 7, annual: 59.99 },
    audit_fix: { monthly: 14, annual: 99.99 },
};

/**
 * Wires a Monthly/Annual toggle to a set of `.pricing-card[data-plan]`
 * elements, updating each card's displayed price. Returns a getter for the
 * currently selected interval so the caller's checkout buttons can read it.
 * Shared between the landing page and account page so both present pricing
 * identically.
 */
export function initPricingToggle(root: ParentNode = document): () => BillingInterval {
    let interval: BillingInterval = 'month';

    function render(): void {
        root.querySelectorAll<HTMLElement>('.pricing-card[data-plan]').forEach(card => {
            const plan = card.dataset.plan!;
            const prices = PRICES[plan];
            if (!prices) return;
            const amountEl = card.querySelector<HTMLElement>('.price-amount');
            const suffixEl = card.querySelector<HTMLElement>('.price-suffix');
            const saveBadge = card.querySelector<HTMLElement>('.save-badge');
            if (interval === 'year') {
                if (amountEl) amountEl.textContent = `$${prices.annual.toFixed(2)}`;
                if (suffixEl) suffixEl.textContent = '/year';
                if (saveBadge) saveBadge.hidden = false;
            } else {
                if (amountEl) amountEl.textContent = `$${prices.monthly}`;
                if (suffixEl) suffixEl.textContent = '/month';
                if (saveBadge) saveBadge.hidden = true;
            }
        });
    }

    root.querySelectorAll<HTMLButtonElement>('.toggle-option').forEach(button => {
        button.addEventListener('click', () => {
            interval = (button.dataset.interval === 'year' ? 'year' : 'month');
            root.querySelectorAll<HTMLButtonElement>('.toggle-option').forEach(b => b.classList.toggle('active', b === button));
            render();
        });
    });

    render();
    return () => interval;
}
