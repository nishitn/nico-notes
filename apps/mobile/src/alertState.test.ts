import { expect, it, vi } from 'vite-plus/test';
import { createAlertStore } from './alertState';

it('queues alerts so a second error does not overwrite an unanswered confirmation', () => {
  const alerts = createAlertStore();
  alerts.show('Delete photo?', 'Confirm deletion', [{ text: 'Cancel' }, { text: 'Delete' }]);
  const confirmation = alerts.getSnapshot()!;
  alerts.show('Upload failed');
  expect(alerts.getSnapshot()).toBe(confirmation);
  alerts.dismiss(confirmation);
  expect(alerts.getSnapshot()?.title).toBe('Upload failed');
  expect(alerts.getSnapshot()?.actions).toEqual([{ text: 'OK' }]);
});

it('backdrop and back dismissals never run a destructive action', () => {
  const alerts = createAlertStore();
  const remove = vi.fn();
  alerts.show('Delete?', undefined, [{ text: 'Delete', style: 'destructive', onPress: remove }]);
  alerts.dismiss(alerts.getSnapshot()!);
  expect(remove).not.toHaveBeenCalled();
  expect(alerts.getSnapshot()).toBeNull();
});

it('runs the selected action once and ignores stale taps after advancing the queue', () => {
  const alerts = createAlertStore();
  const remove = vi.fn();
  const cancel = vi.fn();
  alerts.show('Delete?', undefined, [
    { text: 'Cancel', onPress: cancel },
    { text: 'Delete', onPress: remove },
  ]);
  const first = alerts.getSnapshot()!;
  alerts.show('Next');
  alerts.respond(first, first.actions[1]);
  alerts.respond(first, first.actions[1]);
  alerts.dismiss(first);
  expect(remove).toHaveBeenCalledTimes(1);
  expect(cancel).not.toHaveBeenCalled();
  expect(alerts.getSnapshot()?.title).toBe('Next');
});

it('allows actions to open another alert and notifies subscribed hosts', () => {
  const alerts = createAlertStore();
  const listener = vi.fn();
  const unsubscribe = alerts.subscribe(listener);
  alerts.show('First', undefined, [{ text: 'Next', onPress: () => alerts.show('Second') }]);
  const first = alerts.getSnapshot()!;
  alerts.respond(first, first.actions[0]);
  expect(alerts.getSnapshot()?.title).toBe('Second');
  expect(listener).toHaveBeenCalledTimes(3);
  unsubscribe();
  alerts.dismiss(alerts.getSnapshot()!);
  expect(listener).toHaveBeenCalledTimes(3);
});
