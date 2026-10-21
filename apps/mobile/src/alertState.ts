export type AlertAction = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

export type AppAlert = {
  title: string;
  message?: string;
  actions: AlertAction[];
};

export function createAlertStore() {
  const queue: AppAlert[] = [];
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());
  function close(alert: AppAlert) {
    if (queue[0] !== alert) return false;
    queue.shift();
    notify();
    return true;
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSnapshot: () => queue[0] ?? null,
    show(title: string, message?: string, actions: AlertAction[] = [{ text: 'OK' }]) {
      queue.push({ title, message, actions: actions.length ? actions : [{ text: 'OK' }] });
      notify();
    },
    dismiss: close,
    respond(alert: AppAlert, action: AlertAction) {
      if (!alert.actions.includes(action) || !close(alert)) return;
      action.onPress?.();
    },
  };
}

export const appAlerts = createAlertStore();
export const showAlert = appAlerts.show;
