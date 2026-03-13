import type { ActionButton } from '../../lib/messages';

interface ActionButtonsProps {
  buttons: ActionButton[];
  onAction: (action: string, params?: Record<string, unknown>) => void;
}

const VARIANT_CLASSES: Record<'primary' | 'secondary' | 'ghost', string> = {
  primary: 'bg-bg-brand text-fg-onbrand hover:opacity-90',
  secondary: 'bg-bg-secondary text-fg border border-border hover:bg-bg-hover',
  ghost: 'text-fg-secondary hover:bg-bg-hover',
};

export default function ActionButtons({ buttons, onAction }: ActionButtonsProps) {
  return (
    <div className="flex flex-wrap gap-1.5 py-1">
      {buttons.map((btn) => (
        <button
          key={btn.id}
          className={`px-3 py-1.5 text-11 font-medium rounded-md transition-colors ${VARIANT_CLASSES[btn.variant] || VARIANT_CLASSES.secondary}`}
          onClick={() => onAction(btn.action, btn.params)}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}
