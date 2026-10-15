import { Plus, Utensils, X } from 'lucide-react';

export function RatingCategories({
  value,
  locked = [],
  onChange,
}: {
  value: string[];
  locked?: string[];
  onChange: (value: string[]) => void;
}) {
  return (
    <fieldset className="rating-categories">
      <legend>
        Rating categories <span>{value.length}/20</span>
      </legend>
      <ul className="category-list">
        {value.map((category, index) => (
          <li key={index}>
            <input
              aria-label={`Category ${index + 1}`}
              required
              maxLength={50}
              autoFocus={!category}
              value={category}
              readOnly={locked.includes(category)}
              placeholder="e.g. Ambience"
              ref={(input) => {
                input?.setCustomValidity(
                  !category.trim()
                    ? 'Enter a category name or remove this row.'
                    : value.some(
                          (other, otherIndex) =>
                            otherIndex !== index &&
                            other.trim().toLowerCase() === category.trim().toLowerCase(),
                        )
                      ? 'Choose a different category name.'
                      : '',
                );
              }}
              onChange={(event) =>
                onChange(
                  value.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove category ${index + 1}`}
              disabled={locked.includes(category)}
              onClick={() => onChange(value.filter((_, itemIndex) => itemIndex !== index))}
            >
              <X size={17} />
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="button secondary category-add"
        disabled={value.length >= 20}
        onClick={() => onChange([...value, ''])}
      >
        <Plus size={16} /> Add category
      </button>
    </fieldset>
  );
}

export function DishRatingsToggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="dish-ratings-toggle">
      <span className="settings-icon" aria-hidden="true">
        <Utensils size={18} />
      </span>
      <span>
        <strong>Rate individual dishes</strong>
        <small>Add dishes and give each one its own score.</small>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
