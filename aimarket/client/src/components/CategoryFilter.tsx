import { CATEGORIES } from '../types';

interface CategoryFilterProps {
  selected: string;
  onSelect: (category: string) => void;
}

const OPTIONS = ['All', ...CATEGORIES] as const;

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
      {OPTIONS.map((category) => {
        const active = selected === category;
        return (
          <button
            key={category}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect(category)}
            className={
              active
                ? 'rounded-full bg-brand-600 px-4 py-1.5 text-sm font-medium text-white'
                : 'rounded-full border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100'
            }
          >
            {category}
          </button>
        );
      })}
    </div>
  );
}
