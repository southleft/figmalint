import type { ReferoComparisonData } from '../../lib/messages';

interface ReferoGalleryProps {
  data: ReferoComparisonData;
}

function PatternBadge({ pattern, frequency, variant }: { pattern: string; frequency: string; variant: 'match' | 'missing' }) {
  return (
    <div className={`flex items-center justify-between py-1 px-2 rounded-md text-11 ${
      variant === 'match' ? 'bg-bg-success/10' : 'bg-bg-warning/10'
    }`}>
      <span className={variant === 'match' ? 'text-fg-success' : 'text-fg-warning'}>{pattern}</span>
      <span className="text-fg-tertiary ml-2 shrink-0">{frequency}</span>
    </div>
  );
}

export default function ReferoGallery({ data }: ReferoGalleryProps) {
  return (
    <div className="bg-bg-secondary rounded-xl p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-12 font-medium">Refero Comparison</span>
        <span className="text-11 text-fg-tertiary">
          {data.screenshots.length} example{data.screenshots.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Screenshot thumbnails — horizontal scroll */}
      {data.screenshots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
          {data.screenshots.map((screen, i) => (
            <a
              key={screen.id || i}
              href={screen.fullUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 group"
              title={`${screen.title} — ${screen.company}`}
            >
              <div className="w-[120px] h-[80px] rounded-md overflow-hidden bg-bg-tertiary border border-border group-hover:border-fg-brand transition-colors">
                {screen.thumbnailUrl ? (
                  <img
                    src={screen.thumbnailUrl}
                    alt={screen.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-fg-tertiary text-11">
                    {screen.company}
                  </div>
                )}
              </div>
              <p className="text-10 text-fg-tertiary mt-0.5 truncate w-[120px]">
                {screen.company}
              </p>
            </a>
          ))}
        </div>
      )}

      {/* Matching patterns */}
      {data.matchingPatterns.length > 0 && (
        <div className="space-y-1">
          <p className="text-11 text-fg-secondary font-medium">Matching patterns</p>
          {data.matchingPatterns.map((p, i) => (
            <PatternBadge key={i} pattern={p.pattern} frequency={p.frequency} variant="match" />
          ))}
        </div>
      )}

      {/* Missing patterns */}
      {data.missingPatterns.length > 0 && (
        <div className="space-y-1">
          <p className="text-11 text-fg-secondary font-medium">Missing patterns</p>
          {data.missingPatterns.map((p, i) => (
            <PatternBadge key={i} pattern={p.pattern} frequency={p.frequency} variant="missing" />
          ))}
        </div>
      )}

      {/* Style positioning */}
      {(data.stylePositioning.closest.length > 0 || data.stylePositioning.different.length > 0) && (
        <div className="pt-1 border-t border-border space-y-1">
          {data.stylePositioning.closest.length > 0 && (
            <p className="text-11 text-fg-tertiary">
              <span className="text-fg-secondary">Closest to: </span>
              {data.stylePositioning.closest.join(', ')}
            </p>
          )}
          {data.stylePositioning.different.length > 0 && (
            <p className="text-11 text-fg-tertiary">
              <span className="text-fg-secondary">Different from: </span>
              {data.stylePositioning.different.join(', ')}
            </p>
          )}
        </div>
      )}

      {/* Summary */}
      {data.summary && (
        <p className="text-11 text-fg-tertiary border-t border-border pt-2">
          {data.summary}
        </p>
      )}
    </div>
  );
}
