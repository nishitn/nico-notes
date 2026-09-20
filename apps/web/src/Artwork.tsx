export function Artwork({ variant = 'food' }: { variant?: 'food' | 'adventure' | 'notes' }) {
  return (
    <svg className={`artwork ${variant}`} viewBox="0 0 480 280" fill="none" aria-hidden="true">
      {variant === 'food' ? (
        <>
          <path
            d="M0 60H480M0 140H480M0 220H480M75 0V280M155 0V280M235 0V280M315 0V280M395 0V280"
            stroke="currentColor"
            opacity=".08"
            strokeWidth="22"
          />
          <ellipse cx="249" cy="151" rx="106" ry="91" fill="#603C2B" opacity=".09" />
          <ellipse
            cx="240"
            cy="140"
            rx="104"
            ry="92"
            fill="#FAF7F2"
            stroke="#C9826B"
            strokeWidth="2"
          />
          <ellipse
            cx="240"
            cy="140"
            rx="77"
            ry="67"
            stroke="#C9826B"
            strokeWidth="2"
            strokeDasharray="3 5"
          />
          <path
            d="M207 124c8-27 31-15 31-2 4-25 35-27 38-4 2 18-21 39-36 51-14-10-41-28-33-45Z"
            fill="#E06D53"
          />
          <path
            d="M97 75v49m-11-49v35c0 19 22 19 22 0V75m-11 51v84M375 75v135m0-135c-22 15-21 52 0 58"
            stroke="#745948"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <path d="M389 220c15-15 33-9 21 3-10 11-24 5-21-3Z" fill="#7A9A81" />
          <path d="m418 204-41 42" stroke="#55735A" strokeWidth="3" />
          <path
            d="m140 40 3-9m-13 17-8-1m27 0 7 4"
            stroke="#B25C43"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : variant === 'adventure' ? (
        <>
          <circle cx="343" cy="74" r="32" fill="#E7B68C" />
          <path d="m36 246 145-179 68 79 52-52 145 152" fill="#8EA48B" />
          <path d="m181 67 68 79-32-12-17 9-26-24-32-4Z" fill="#FAF7F2" />
          <path d="m5 260 125-115 80 80 95-62 169 97" fill="#486B57" />
          <path d="M209 280c-49-83 111-36 76-108" stroke="#EAD9BE" strokeWidth="13" />
          <path
            d="m57 78 17-6 16 6m18 20 12-6 13 6"
            stroke="#486B57"
            strokeWidth="3"
            strokeLinecap="round"
          />
        </>
      ) : (
        <>
          <rect
            x="140"
            y="38"
            width="192"
            height="214"
            rx="10"
            transform="rotate(-8 140 38)"
            fill="#C48268"
            opacity=".25"
          />
          <rect
            x="153"
            y="27"
            width="192"
            height="214"
            rx="10"
            transform="rotate(5 153 27)"
            fill="#FAF7F2"
          />
          <path
            d="m179 159 115 10m-118 12 118 10m-120 12 78 7"
            stroke="#C8B6A3"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <path d="M224 99c-10-20-35-2-14 15l24 22 28-22c26-22-5-41-18-20l-9 11Z" fill="#E06D53" />
          <path d="m340 182 26-66 10 4-25 66-11 8Z" fill="#7A9A81" />
          <rect
            x="210"
            y="18"
            width="81"
            height="25"
            rx="3"
            transform="rotate(5 210 18)"
            fill="#7A9A81"
            opacity=".65"
          />
        </>
      )}
    </svg>
  );
}
