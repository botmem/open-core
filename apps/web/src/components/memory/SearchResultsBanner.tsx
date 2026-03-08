interface SearchResultsBannerProps {
  resolvedEntities: {
    contacts: { id: string; displayName: string }[];
    topicWords: string[];
    topicMatchCount: number;
  } | null;
  resultCount: number;
  searchFallback?: boolean;
  query?: string;
}

export function SearchResultsBanner({ resolvedEntities, resultCount, searchFallback, query }: SearchResultsBannerProps) {
  if (resolvedEntities) {
    const names = resolvedEntities.contacts.map(c => c.displayName).join(', ');
    const hasTopics = resolvedEntities.topicWords.length > 0;
    const topicStr = resolvedEntities.topicWords.join(' ');
    const noDirectMatches = hasTopics && resolvedEntities.topicMatchCount === 0;

    if (resultCount === 0) {
      return (
        <div className="border-2 border-yellow-500/40 bg-yellow-500/10 px-4 py-3 mb-2">
          <p className="font-mono text-xs text-yellow-300">
            No memories found for <span className="font-bold text-yellow-100">{names}</span>
            {hasTopics && <> about <span className="font-bold text-yellow-100">{topicStr}</span></>}
          </p>
        </div>
      );
    }

    if (noDirectMatches) {
      return (
        <div className="border-2 border-yellow-500/40 bg-yellow-500/10 px-4 py-3 mb-2">
          <p className="font-mono text-xs text-yellow-300">
            No directly related memories found for <span className="font-bold text-yellow-100">{names}</span>
            {' '}about <span className="font-bold text-yellow-100">{topicStr}</span>.
            {' '}Showing closest matches.
          </p>
        </div>
      );
    }

    return (
      <div className="border-2 border-cyan-500/40 bg-cyan-500/10 px-4 py-3 mb-2">
        <p className="font-mono text-xs text-cyan-300">
          Showing results for <span className="font-bold text-cyan-100">{names}</span>
          {hasTopics && <> + <span className="font-bold text-cyan-100">{topicStr}</span></>}
        </p>
      </div>
    );
  }

  if (searchFallback) {
    return (
      <div className="border-2 border-yellow-500/40 bg-yellow-500/10 px-4 py-3 mb-2">
        <p className="font-mono text-xs font-bold text-yellow-400 uppercase">No exact matches</p>
        <p className="font-mono text-xs text-nb-muted mt-1">
          No memories matched &quot;{query}&quot; by text or contact name. Showing semantically similar results instead.
        </p>
      </div>
    );
  }

  return null;
}
