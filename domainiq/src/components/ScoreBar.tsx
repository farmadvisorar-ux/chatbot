export default function ScoreBar({ label, score, detail }: { label: string; score: number; detail?: string }) {
    const color = score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-brand-500' : score >= 30 ? 'bg-amber-500' : 'bg-red-500';
    return (
        <div>
            <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-medium">{label}</span>
                <span className="text-slate-500">{score}/100</span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(2, score)}%` }} />
            </div>
            {detail && <p className="mt-1 text-xs text-slate-500">{detail}</p>}
        </div>
    );
}
