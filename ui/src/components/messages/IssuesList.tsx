import { useState } from 'react';
import type { LintError } from '../../lib/messages';

interface IssuesListProps {
  errors: LintError[];
  onJumpToNode: (nodeId: string) => void;
}

const SEVERITY_STYLES: Record<string, { label: string; color: string; bg: string }> = {
  critical: { label: 'Critical', color: 'text-fg-danger', bg: 'bg-bg-danger' },
  warning: { label: 'Warning', color: 'text-fg-warning', bg: 'bg-bg-warning' },
  info: { label: 'Info', color: 'text-fg-secondary', bg: 'bg-bg-tertiary' },
};

const TYPE_SEVERITY_MAP: Record<string, { label: string; color: string; bg: string }> = {
  fill: SEVERITY_STYLES.critical,
  stroke: SEVERITY_STYLES.critical,
  effect: SEVERITY_STYLES.critical,
  text: SEVERITY_STYLES.critical,
  radius: SEVERITY_STYLES.warning,
  spacing: SEVERITY_STYLES.warning,
  autoLayout: SEVERITY_STYLES.warning,
  accessibility: SEVERITY_STYLES.critical,
};

const TYPE_LABELS: Record<string, string> = {
  fill: 'Fill',
  stroke: 'Stroke',
  effect: 'Effect',
  text: 'Text',
  radius: 'Radius',
  spacing: 'Spacing',
  autoLayout: 'Auto Layout',
  accessibility: 'A11y',
};

export default function IssuesList({ errors, onJumpToNode }: IssuesListProps) {
  const [expanded, setExpanded] = useState(false);
  const displayErrors = expanded ? errors : errors.slice(0, 5);
  const hasMore = errors.length > 5;

  return (
    <div className="bg-bg-secondary rounded-xl overflow-hidden">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="text-12 font-medium">{errors.length} Issues</span>
      </div>

      <div className="divide-y divide-border">
        {displayErrors.map((err, i) => {
          const severity = (err.severity && SEVERITY_STYLES[err.severity]) || TYPE_SEVERITY_MAP[err.errorType] || SEVERITY_STYLES.warning;
          return (
            <div key={`${err.nodeId}-${err.errorType}-${i}`} className="px-3 py-2 hover:bg-bg-hover transition-colors">
              <div className="flex items-start gap-2">
                <span className={`text-11 px-1 py-0.5 rounded ${severity.bg} ${severity.color} shrink-0 mt-0.5`}>
                  {TYPE_LABELS[err.errorType] || err.errorType}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-12 text-fg truncate">{err.message}</p>
                  <button
                    className="text-11 text-bg-brand hover:underline mt-0.5"
                    onClick={() => onJumpToNode(err.nodeId)}
                  >
                    {err.nodeName}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          className="w-full px-3 py-1.5 text-11 text-bg-brand hover:bg-bg-hover transition-colors text-center"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show less' : `Show ${errors.length - 5} more`}
        </button>
      )}
    </div>
  );
}
