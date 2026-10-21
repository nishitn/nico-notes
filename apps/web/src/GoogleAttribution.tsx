import { attributionParts } from '@nico-notes/backend/attributions';
import { useLivePlace } from './convexLive';

export function GoogleAttribution({
  placeId,
  attributions = [],
}: {
  placeId?: string;
  attributions?: string[];
}) {
  const live = useLivePlace(placeId);
  return (
    <div className="google-attribution">
      <span translate="no">Google Maps</span>
      {(live?.attributions ?? attributions).map((html, index) => (
        <span key={index}>
          {attributionParts(html).map((part, partIndex) => {
            const text = (
              <span
                style={{
                  fontWeight: part.bold ? 700 : 400,
                  fontStyle: part.italic ? 'italic' : 'normal',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {part.text}
              </span>
            );
            return part.href ? (
              <a key={partIndex} href={part.href} target="_blank" rel="noreferrer">
                {text}
              </a>
            ) : (
              <span key={partIndex}>{text}</span>
            );
          })}
        </span>
      ))}
    </div>
  );
}

export function GoogleSearchInfo() {
  return (
    <details className="google-attribution">
      <summary>About these results</summary>
      <p>
        Google ranks places using relevance, distance and prominence. We show up to five matching
        results; nearby searches use your foreground location when available.
      </p>
      <a href="https://support.google.com/business/answer/7091" target="_blank" rel="noreferrer">
        Learn more
      </a>
    </details>
  );
}
