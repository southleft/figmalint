import type { ScoreBreakdown } from '../../lib/messages';

interface ScoreCardProps {
  data: ScoreBreakdown;
}

interface BarProps {
  label: string;
  passed: number;
  failed: number;
}

function ScoreBar({ label, passed, failed }: BarProps) {
  const total = passed + failed;
  if (total === 0) return null;
  const pct = Math.round((passed / total) * 100);

  return (
    <div className="flex items-center gap-2 text-11">
      <span className="w-20 text-fg-secondary truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${pct >= 90 ? 'bg-fg-success' : pct >= 60 ? 'bg-fg-warning' : 'bg-fg-danger'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 text-right tabular-nums">{failed > 0 ? `${failed}` : '-'}</span>
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
        <span className="text-12 font-medium">Design Lint Score</span>
        <span className={`text-[20px] font-bold tabular-nums ${getScoreColor(data.overall)}`}>
          {data.overall}
        </span>
      </div>

      <div className="space-y-1">
        <ScoreBar label="Fills" passed={data.fills.passed} failed={data.fills.failed} />
        <ScoreBar label="Strokes" passed={data.strokes.passed} failed={data.strokes.failed} />
        <ScoreBar label="Effects" passed={data.effects.passed} failed={data.effects.failed} />
        <ScoreBar label="Text styles" passed={data.textStyles.passed} failed={data.textStyles.failed} />
        <ScoreBar label="Radius" passed={data.radius.passed} failed={data.radius.failed} />
        <ScoreBar label="Spacing" passed={data.spacing.passed} failed={data.spacing.failed} />
        <ScoreBar label="Auto Layout" passed={data.autoLayout.passed} failed={data.autoLayout.failed} />
      </div>
    </div>
  );
}
