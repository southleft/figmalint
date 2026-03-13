import type { AiReviewData } from '../../lib/messages';

interface AiReviewCardProps {
  data: AiReviewData;
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-fg-success';
  if (score >= 50) return 'text-fg-warning';
  return 'text-fg-danger';
}

function ScoreRow({ label, score, notes }: { label: string; score: number; notes: string }) {
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between">
        <span className="text-11 text-fg-secondary">{label}</span>
        <span className={`text-12 font-medium tabular-nums ${getScoreColor(clamped)}`}>{clamped}/100</span>
      </div>
      <div className="h-1 bg-bg-tertiary rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${clamped >= 80 ? 'bg-fg-success' : clamped >= 50 ? 'bg-fg-warning' : 'bg-fg-danger'}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {notes && <p className="text-11 text-fg-tertiary">{notes}</p>}
    </div>
  );
}

export default function AiReviewCard({ data }: AiReviewCardProps) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-12 font-medium">AI Visual Review</span>
        <span className={`text-[20px] font-bold tabular-nums ${getScoreColor(data.overallScore)}`}>
          {data.overallScore}
        </span>
      </div>

      <div className="space-y-2">
        <ScoreRow label="Visual Hierarchy" score={data.visualHierarchy.score} notes={data.visualHierarchy.notes} />
        <ScoreRow label="Spacing & Rhythm" score={data.spacingRhythm.score} notes={data.spacingRhythm.notes} />
        <ScoreRow label="Color Harmony" score={data.colorHarmony.score} notes={data.colorHarmony.notes} />
      </div>

      {data.missingStates.length > 0 && (
        <div className="pt-1 border-t border-border">
          <span className="text-11 text-fg-secondary">Missing states: </span>
          <span className="text-11 text-fg-warning">{data.missingStates.join(', ')}</span>
        </div>
      )}
    </div>
  );
}
