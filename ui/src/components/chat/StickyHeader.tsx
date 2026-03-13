import type { ScoreBreakdown } from '../../lib/messages';

interface StickyHeaderProps {
  componentName?: string;
  score: ScoreBreakdown | null;
  totalIssues: number;
  issuesFixed: number;
  onOpenSettings?: () => void;
}

function getVerdictInfo(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: 'PASSED', color: 'text-fg-success', bg: 'bg-bg-success' };
  if (score >= 60) return { label: 'NEEDS WORK', color: 'text-fg-warning', bg: 'bg-bg-warning' };
  return { label: 'ISSUES FOUND', color: 'text-fg-danger', bg: 'bg-bg-danger' };
}

export default function StickyHeader({ componentName, score, totalIssues, issuesFixed, onOpenSettings }: StickyHeaderProps) {
  if (!score) return null;

  const verdict = getVerdictInfo(score.overall);
  const clampedFixed = Math.min(issuesFixed, totalIssues);
  const remaining = Math.max(0, totalIssues - clampedFixed);

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-bg-secondary">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-12 truncate">{componentName || 'Component'}</span>
          <span className={`text-11 font-semibold px-1.5 py-0.5 rounded ${verdict.bg} ${verdict.color}`}>
            {score.overall}/100
          </span>
          <span className={`text-11 px-1.5 py-0.5 rounded ${verdict.bg} ${verdict.color}`}>
            {verdict.label}
          </span>
        </div>
        {totalIssues > 0 && (
          <div className="text-11 text-fg-secondary mt-0.5">
            {clampedFixed > 0 && <span className="text-fg-success">{clampedFixed} fixed</span>}
            {clampedFixed > 0 && remaining > 0 && ' · '}
            {remaining > 0 && <span>{remaining} remaining</span>}
          </div>
        )}
      </div>
      {onOpenSettings && (
        <button
          onClick={onOpenSettings}
          className="shrink-0 w-7 h-7 flex items-center justify-center text-fg-tertiary hover:text-fg rounded-md hover:bg-bg-hover transition-colors"
          title="Settings"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}
    </div>
  );
}
