import { expect, it } from 'vite-plus/test';
import { ConvexError } from 'convex/values';
import { message } from './ui';

it('shows the Convex user message instead of the transport error and stack', () => {
  expect(message(new ConvexError('Only a board admin can remove dishes.'))).toBe(
    'Only a board admin can remove dishes.',
  );
  expect(
    message({ message: '[CONVEX request] Server Error', data: 'Choose a valid visit date.' }),
  ).toBe('Choose a valid visit date.');
  expect(message(new ConvexError({ message: 'This board is unavailable.' }))).toBe(
    'This board is unavailable.',
  );
});

it('replaces unexpected Convex transport details with a readable fallback', () => {
  const error = new Error('[CONVEX M(places:ensureLinked)] [Request ID: abc123] Server Error');
  expect(message(error)).toBe('Something went wrong. Please try again.');
  expect(message(error, 'We couldn’t link your places.')).toBe('We couldn’t link your places.');
  expect(message(new ConvexError('Please sign in.'), 'Try again.')).toBe('Please sign in.');
});
