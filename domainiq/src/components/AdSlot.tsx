/**
 * Placeholder ad slot. Swap the inner div for your ad network's real embed
 * (e.g. Google AdSense/Ad Manager tag) once you have an account approved —
 * kept as an inert placeholder so the layout doesn't depend on a live
 * third-party script to build/run.
 */
export default function AdSlot({ label = 'Advertisement', className = '' }: { label?: string; className?: string }) {
    return (
        <div className={`card flex min-h-[90px] items-center justify-center border-dashed text-xs uppercase tracking-wide text-slate-400 ${className}`}>
            {label} slot
        </div>
    );
}
