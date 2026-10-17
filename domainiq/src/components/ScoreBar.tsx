export default function ScoreBar({ label, score, detail }: { label: string; score: number; detail?: string }) {
    const roundedScore = Math.round(score);
    const tier =
        roundedScore >= 85
            ? { text: 'Optimal', badge: 'bg-emerald-950 text-emerald-400 border-emerald-800' }
            : roundedScore >= 70
            ? { text: 'Strong', badge: 'bg-blue-950 text-blue-400 border-blue-800' }
            : roundedScore >= 50
            ? { text: 'Average', badge: 'bg-amber-950 text-amber-400 border-amber-800' }
            : { text: 'Discounted', badge: 'bg-red-950 text-red-400 border-red-800' };

    const barGradient =
        roundedScore >= 75
            ? 'from-emerald-500 to-teal-400'
            : roundedScore >= 50
            ? 'from-brand-500 to-indigo-400'
            : roundedScore >= 30
            ? 'from-amber-500 to-yellow-400'
            : 'from-rose-500 to-red-400';

    return (
        <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{label}</span>
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] font-mono font-semibold ${tier.badge}`}>
                        {tier.text}
                    </span>
                </div>
                <span className="font-mono font-bold text-slate-300">{roundedScore}/100</span>
            </div>

            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-slate-800">
                <div
                    className={`h-full rounded-full bg-gradient-to-r ${barGradient} transition-all duration-500 shadow-sm`}
                    style={{ width: `${Math.max(3, roundedScore)}%` }}
                />
            </div>

            {detail && <p className="text-xs text-slate-400 leading-relaxed pt-0.5">{detail}</p>}
        </div>
    );
}
