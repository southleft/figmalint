import type { ScoreBreakdown, ScoreGrade } from '../../lib/messages';

interface ScoreCardProps {
  data: ScoreBreakdown;
}

interface CategoryBarProps {
  label: string;
  score: number;
  weight: string;
  failed: number;
}

function CategoryBar({ label, score, weight, failed }: CategoryBarProps) {
  return (
    <div className="flex items-center gap-2 text-11">
      <span className="w-24 text-fg-secondary truncate">{label} <span className="text-fg-tertiary">{weight}</span></span>
      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${score >= 90 ? 'bg-fg-success' : score >= 70 ? 'bg-fg-warning' : 'bg-fg-danger'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`w-10 text-right tabular-nums ${score >= 90 ? 'text-fg-success' : score >= 70 ? 'text-fg-warning' : 'text-fg-danger'}`}>
        {score}%
      </span>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-fg-success';
  if (score >= 70) return 'text-fg-warning';
  return 'text-fg-danger';
}

const GRADE_STYLES: Record<ScoreGrade, { label: string; color: string; bg: string }> = {
  'excellent': { label: 'Excellent', color: 'text-fg-success', bg: 'bg-bg-success' },
  'needs-work': { label: 'Needs Work', color: 'text-fg-warning', bg: 'bg-bg-warning' },
  'poor': { label: 'Poor', color: 'text-fg-danger', bg: 'bg-bg-danger' },
};

export default function ScoreCard({ data }: ScoreCardProps) {
  const grade = GRADE_STYLES[data.grade];

  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-12 font-medium">Design Health</span>
        <div className="flex items-center gap-2">
          <span className={`text-11 font-semibold px-1.5 py-0.5 rounded ${grade.bg} ${grade.color}`}>
            {grade.label}
          </span>
          <span className={`text-[20px] font-bold tabular-nums ${getScoreColor(data.overall)}`}>
            {data.overall}
          </span>
        </div>
      </div>

      <div className="space-y-1">
        <CategoryBar label="Tokens" weight="30%" score={data.tokens.score} failed={data.tokens.failed} />
        <CategoryBar label="Spacing" weight="20%" score={data.spacing.score} failed={data.spacing.failed} />
        <CategoryBar label="Layout" weight="10%" score={data.layout.score} failed={data.layout.failed} />
        <CategoryBar label="Accessibility" weight="30%" score={data.accessibility.score} failed={data.accessibility.failed} />
        <CategoryBar label="Naming" weight="10%" score={data.naming.score} failed={data.naming.failed} />
      </div>
    </div>
  );
}
