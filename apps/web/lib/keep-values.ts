// React 19 resets a form after its action runs, and selects do not pick up new defaults. Forms
// that stay on screen after saving submit through this instead, so what people typed stays put.
import { startTransition, type FormEvent } from 'react';

export function keepValues(action: (data: FormData) => void) {
  return (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const data = new FormData(ev.currentTarget);
    startTransition(() => action(data));
  };
}
