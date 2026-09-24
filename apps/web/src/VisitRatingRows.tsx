import { Plus, X } from 'lucide-react';

export type RatingDraft = { key: string; name: string; scores: Record<string, string> };
export const ratingDrafts = (names: string[]): RatingDraft[] =>
  names.map((name) => ({ key: crypto.randomUUID(), name, scores: {} }));

export function DraftScore({
  name,
  value,
  onChange,
}: {
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="draft-score">
      <input
        aria-label={name}
        type="number"
        min={1}
        max={10}
        step={0.5}
        placeholder="—"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span aria-hidden="true">/10</span>
    </div>
  );
}

export function VisitRatingRows({
  kind,
  rows,
  onChange,
  userId,
  memberName,
  overall,
}: {
  kind: 'category' | 'dish';
  rows: RatingDraft[];
  onChange: (rows: RatingDraft[]) => void;
  userId: string;
  memberName: string;
  overall?: { value: string; onChange: (value: string) => void };
}) {
  const category = kind === 'category';
  const limit = category ? 20 : 50;
  return (
    <section className="draft-ratings-card" aria-label={category ? 'Rating categories' : 'Dishes'}>
      <div className="draft-ratings-heading">
        <h2>{category ? 'Rating categories' : 'Dishes'}</h2>
      </div>
      {overall && (
        <div className="draft-rating-row overall-draft-row">
          <strong>Overall</strong>
          <DraftScore
            name={`Overall rating for ${memberName}`}
            value={overall.value}
            onChange={overall.onChange}
          />
          <span />
        </div>
      )}
      {rows.map((row, index) => (
        <div className="draft-rating-row" key={row.key}>
          <input
            className="draft-rating-name"
            aria-label={`${category ? 'Category' : 'Dish'} ${index + 1}`}
            required
            maxLength={category ? 50 : 120}
            autoFocus={!row.name}
            placeholder={category ? 'Category name' : 'Dish name'}
            value={row.name}
            ref={(input) =>
              input?.setCustomValidity(
                !row.name.trim()
                  ? `Enter a ${kind} name or remove this row.`
                  : category &&
                      rows.some(
                        (other) =>
                          other.key !== row.key &&
                          other.name.trim().toLowerCase() === row.name.trim().toLowerCase(),
                      )
                    ? 'Choose a different category name.'
                    : '',
              )
            }
            onChange={(event) =>
              onChange(
                rows.map((item) =>
                  item.key === row.key ? { ...item, name: event.target.value } : item,
                ),
              )
            }
          />
          <DraftScore
            name={`${row.name || `${category ? 'Category' : 'Dish'} ${index + 1}`} rating for ${memberName}`}
            value={row.scores[userId] ?? ''}
            onChange={(score) =>
              onChange(
                rows.map((item) =>
                  item.key === row.key
                    ? { ...item, scores: { ...item.scores, [userId]: score } }
                    : item,
                ),
              )
            }
          />
          <button
            type="button"
            className="icon-button"
            aria-label={`Remove ${kind} ${index + 1}`}
            onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
          >
            <X size={16} />
          </button>
        </div>
      ))}
      <button
        type="button"
        className="draft-rating-add"
        disabled={rows.length >= limit}
        onClick={() => onChange([...rows, ...ratingDrafts([''])])}
      >
        <Plus size={16} />
        {category ? 'Add category' : 'Add dish'}
      </button>
    </section>
  );
}
