interface QuickActionsProps {
  onAnalyze: () => void;
  hasFixable: boolean;
  analysisMode?: 'quick' | 'deep';
  onAction: (action: string, params?: Record<string, unknown>) => void;
}

export default function QuickActions({ onAnalyze, hasFixable, analysisMode = 'quick', onAction }: QuickActionsProps) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 border-t border-border overflow-x-auto">
      {hasFixable && (
        <button
          className="shrink-0 px-2 py-1 text-11 bg-bg-brand text-fg-onbrand rounded-md hover:opacity-90 transition-opacity"
          onClick={() => onAction('fix-all')}
        >
          Fix all
        </button>
      )}
      <button
        className="shrink-0 px-2 py-1 text-11 text-fg-secondary hover:bg-bg-hover rounded-md transition-colors"
        onClick={onAnalyze}
      >
        Re-scan
      </button>
      <button
        className="shrink-0 px-2 py-1 text-11 text-fg-secondary hover:bg-bg-hover rounded-md transition-colors"
        onClick={() => onAction('export')}
        title="Copy markdown report"
      >
        Export
      </button>
      <button
        className="shrink-0 px-2 py-1 text-11 text-fg-tertiary hover:bg-bg-hover rounded-md transition-colors"
        onClick={() => onAction('export-json')}
        title="Copy JSON report"
      >
        JSON
      </button>
      <button
        className="shrink-0 px-2 py-1 text-11 text-fg-tertiary hover:bg-bg-hover rounded-md transition-colors"
        onClick={() => onAction('toggle-mode')}
        title={analysisMode === 'quick' ? 'Switch to deep analysis (includes Refero)' : 'Switch to quick analysis'}
      >
        {analysisMode === 'quick' ? 'Quick' : 'Deep'}
      </button>
    </div>
  );
}
