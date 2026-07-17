interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  aiSearch: boolean;
  onToggleAiSearch: (enabled: boolean) => void;
}

/**
 * Product search input. Debouncing is handled by the parent (via useDebounce)
 * so the input stays fully controlled and testable.
 *
 * The "AI Search" toggle is the semantic-search UI. In Phase 2 it is wired to
 * the API's POST /products/search contract (which currently uses a keyword
 * fallback); Phase 3/4 swaps the backend to Azure AI Search with no client
 * change required.
 */
export function SearchBar({ value, onChange, aiSearch, onToggleAiSearch }: SearchBarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-400">
          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.45 4.39l3.08 3.08a1 1 0 01-1.42 1.42l-3.08-3.08A7 7 0 012 9z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search products..."
          aria-label="Search products"
          className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm shadow-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500"
        />
      </div>

      <label
        className="inline-flex cursor-pointer select-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-600"
        title="Use semantic AI search (backed by the search API)"
      >
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          checked={aiSearch}
          onChange={(e) => onToggleAiSearch(e.target.checked)}
          aria-label="Enable AI search"
        />
        <span className="whitespace-nowrap font-medium">✨ AI Search</span>
      </label>
    </div>
  );
}
