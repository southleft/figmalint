import type { AiReviewData, AiRating, AiReviewCategory } from '../../lib/messages';

interface AiReviewCardProps {
  data: AiReviewData;
}

const RATING_STYLES: Record<AiRating, { label: string; color: string; bg: string }> = {
  'pass': { label: 'PASS', color: 'text-fg-success', bg: 'bg-bg-success' },
  'needs_improvement': { label: 'NEEDS IMPROVEMENT', color: 'text-fg-warning', bg: 'bg-bg-warning' },
  'fail': { label: 'FAIL', color: 'text-fg-danger', bg: 'bg-bg-danger' },
};

function RatingBadge({ rating }: { rating: AiRating }) {
  const style = RATING_STYLES[rating];
  return (
    <span className={`text-10 font-semibold px-1.5 py-0.5 rounded ${style.bg} ${style.color}`}>
      {style.label}
    </span>
  );
}

function CategoryRow({ label, category, extra }: { label: string; category: AiReviewCategory; extra?: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-11 text-fg-secondary">{label}</span>
        <RatingBadge rating={category.rating} />
      </div>
      {category.evidence.length > 0 && (
        <ul className="text-11 text-fg-tertiary space-y-0.5 pl-3">
          {category.evidence.map((e, i) => (
            <li key={i} className="list-disc">{e}</li>
          ))}
        </ul>
      )}
      {category.recommendation && (
        <p className="text-11 text-fg-warning pl-3">{category.recommendation}</p>
      )}
      {extra}
    </div>
  );
}

export default function AiReviewCard({ data }: AiReviewCardProps) {
  const missingStates = data.statesCoverage?.missingStates || [];

  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-2">
      <span className="text-12 font-medium">AI Design Review</span>

      <div className="space-y-2">
        <CategoryRow label="Visual Hierarchy" category={data.visualHierarchy} />
        <CategoryRow
          label="States Coverage"
          category={data.statesCoverage}
          extra={missingStates.length > 0 ? (
            <div className="text-11 pl-3">
              <span className="text-fg-secondary">Missing: </span>
              <span className="text-fg-warning">{missingStates.join(', ')}</span>
            </div>
          ) : undefined}
        />
        <CategoryRow
          label="Platform Alignment"
          category={data.platformAlignment}
          extra={data.platformAlignment?.detectedPlatform ? (
            <div className="text-11 pl-3 text-fg-tertiary">
              Detected: {data.platformAlignment.detectedPlatform}
            </div>
          ) : undefined}
        />
        <CategoryRow label="Color Harmony" category={data.colorHarmony} />
      </div>
    </div>
  );
}
