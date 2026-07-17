interface StarRatingProps {
  rating: number;
  reviewCount?: number;
  size?: 'sm' | 'md';
}

/** Accessible star rating rendered from a 0-5 numeric rating. */
export function StarRating({ rating, reviewCount, size = 'sm' }: StarRatingProps) {
  const rounded = Math.round(rating * 2) / 2;
  const full = Math.floor(rounded);
  const half = rounded - full === 0.5;
  const dimension = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  return (
    <div
      className="flex items-center gap-1"
      role="img"
      aria-label={`Rated ${rating} out of 5`}
      data-testid="star-rating"
    >
      <div className="flex text-amber-400">
        {Array.from({ length: 5 }).map((_, i) => {
          const filled = i < full;
          const isHalf = i === full && half;
          return (
            <svg
              key={i}
              className={dimension}
              viewBox="0 0 20 20"
              fill={filled ? 'currentColor' : 'none'}
              stroke="currentColor"
              aria-hidden="true"
            >
              {isHalf ? (
                <defs>
                  <linearGradient id={`half-${i}`}>
                    <stop offset="50%" stopColor="currentColor" />
                    <stop offset="50%" stopColor="transparent" />
                  </linearGradient>
                </defs>
              ) : null}
              <path
                fill={isHalf ? `url(#half-${i})` : undefined}
                strokeWidth="1"
                d="M9.05 2.93c.3-.92 1.6-.92 1.9 0l1.36 4.18a1 1 0 00.95.69h4.4c.97 0 1.37 1.24.59 1.81l-3.56 2.59a1 1 0 00-.36 1.12l1.36 4.18c.3.92-.75 1.69-1.54 1.12l-3.56-2.59a1 1 0 00-1.18 0l-3.56 2.59c-.79.57-1.84-.2-1.54-1.12l1.36-4.18a1 1 0 00-.36-1.12L1.4 9.61c-.78-.57-.38-1.81.59-1.81h4.4a1 1 0 00.95-.69l1.36-4.18z"
              />
            </svg>
          );
        })}
      </div>
      <span className="text-xs text-slate-500">
        {rating.toFixed(1)}
        {typeof reviewCount === 'number' ? ` (${reviewCount})` : ''}
      </span>
    </div>
  );
}
