// React 19 resets a form after its action runs, and selects do not pick up new defaults. Forms
// that stay on screen after saving submit through this instead, so what people typed stays put.
import { startTransition, type FormEvent } from 'react';

export function keepValues(action: (data: FormData) => void) {
  return (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    // Include the button that was pressed, so forms with several (Publish / Save as draft) can tell.
    const submitter = (ev.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const data = new FormData(ev.currentTarget, submitter && (submitter as HTMLButtonElement).name ? submitter : undefined);
    startTransition(() => action(data));
  };
}
