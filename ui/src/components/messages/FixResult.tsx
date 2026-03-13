interface FixResultProps {
  data: {
    nodeId: string;
    nodeName: string;
    applied: boolean;
    oldValue?: string;
    newValue?: string;
  };
}

export default function FixResult({ data }: FixResultProps) {
  if (!data.applied) {
    return (
      <div className="bg-bg-danger rounded-xl px-3 py-2 text-12 text-fg-danger">
        Fix failed for "{data.nodeName}"
      </div>
    );
  }

  return (
    <div className="bg-bg-success rounded-xl px-3 py-2 text-12">
      <div className="flex items-center gap-1.5">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-success shrink-0">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <span className="text-fg">
          Applied fix to <strong>{data.nodeName}</strong>
        </span>
      </div>
      {data.oldValue && data.newValue && (
        <div className="text-11 text-fg-secondary mt-1 ml-5">
          {data.oldValue} &rarr; {data.newValue}
        </div>
      )}
    </div>
  );
}
