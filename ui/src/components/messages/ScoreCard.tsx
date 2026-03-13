import type { ScoreBreakdown } from '../../lib/messages';

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
          className={`h-full rounded-full transition-all ${score >= 90 ? 'bg-fg-success' : score >= 60 ? 'bg-fg-warning' : 'bg-fg-danger'}`}
          style={{ width: `${score}%` }}
        />
      </div>
      <span className={`w-10 text-right tabular-nums ${score >= 90 ? 'text-fg-success' : score >= 60 ? 'text-fg-warning' : 'text-fg-danger'}`}>
        {score}%
      </span>
    </div>
  );
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'text-fg-success';
  if (score >= 60) return 'text-fg-warning';
  return 'text-fg-danger';
}

export default function ScoreCard({ data }: ScoreCardProps) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-12 font-medium">Design Score</span>
        <span className={`text-[20px] font-bold tabular-nums ${getScoreColor(data.overall)}`}>
          {data.overall}
        </span>
      </div>

      <div className="space-y-1">
        <CategoryBar label="Tokens" weight="25%" score={data.tokens.score} failed={data.tokens.failed} />
        <CategoryBar label="Spacing" weight="15%" score={data.spacing.score} failed={data.spacing.failed} />
        <CategoryBar label="Layout" weight="10%" score={data.layout.score} failed={data.layout.failed} />
        <CategoryBar label="Accessibility" weight="25%" score={data.accessibility.score} failed={data.accessibility.failed} />
        {data.aiReview.score > 0 && (
          <CategoryBar label="AI Review" weight="25%" score={data.aiReview.score} failed={0} />
        )}
      </div>
    </div>
  );
}
