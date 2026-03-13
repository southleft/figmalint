import type { ScoreBreakdown } from '../../lib/messages';

interface StickyHeaderProps {
  componentName?: string;
  score: ScoreBreakdown | null;
  totalIssues: number;
  issuesFixed: number;
}

function getVerdictInfo(score: number): { label: string; color: string; bg: string } {
  if (score >= 90) return { label: 'PASSED', color: 'text-fg-success', bg: 'bg-bg-success' };
  if (score >= 60) return { label: 'NEEDS WORK', color: 'text-fg-warning', bg: 'bg-bg-warning' };
  return { label: 'ISSUES FOUND', color: 'text-fg-danger', bg: 'bg-bg-danger' };
}

export default function StickyHeader({ componentName, score, totalIssues, issuesFixed }: StickyHeaderProps) {
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
    </div>
  );
}
