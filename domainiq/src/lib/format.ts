export function formatUsd(value: number): string {
    if (value >= 1_000_000) {
        return `$${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    }
    if (value >= 1_000) {
        return `$${Math.round(value / 1000)}K`;
    }
    return `$${Math.round(value).toLocaleString()}`;
}

export function formatUsdExact(value: number): string {
    return `$${Math.round(value).toLocaleString()}`;
}
