import AdBox from './AdBox';

interface AdSlotProps {
    slotId?: 1 | 2 | 3 | 4;
    variant?: 'billboard' | 'showcase' | 'tile' | 'banner';
    label?: string;
    className?: string;
}

export default function AdSlot({
    slotId = 1,
    variant = 'banner',
    className = '',
}: AdSlotProps) {
    return <AdBox slotId={slotId} variant={variant} className={className} />;
}
