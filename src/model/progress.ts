/**
 * Progress and cancellation for `parse` and `check`, with no host globals.
 *
 * A cancel token is any object with a boolean `aborted`: a browser's `AbortSignal` fits, so does
 * `createCancelToken().signal`. The engine only reads the flag, at points where it already reports progress.
 *
 * Both functions are synchronous, so a flag can only change while they run if something else can write it:
 * the `onProgress` callback itself (it runs on the same thread), a shared-memory flag read through a getter, or
 * a host that drives `parseSteps` / `checkSteps` itself and gives the event loop a turn between steps.
 * That last form is the one to use in a worker that has to hear a Cancel message.
 */

/** Anything with a boolean `aborted`. A DOM `AbortSignal` satisfies it. */
export interface CancelSignal {
  readonly aborted: boolean;
}

/** A progress report. Reports come at most every few thousand lines or records, never per line. */
export interface Progress {
  task: 'parse' | 'check';
  /** The step in progress: `read`, `lines`, `records`, `structure` for parse; `file`, `groups`, `transactions`, `records` for check. */
  stage: string;
  /** Work done and work in this stage (bytes for `lines`, lines or records for the others). */
  done: number;
  total: number;
  /** 0 to 1 across the whole task, safe to hand to a progress bar. Never goes down. */
  fraction: number;
}

export interface RunOptions {
  /** Called at each step with the same object the step generator yields. */
  onProgress?: (progress: Progress) => void;
  /** Checked at each step; when `aborted` is true the run throws `CancelledError`. */
  signal?: CancelSignal;
}

/** Thrown by `parse` / `check` (and by the step generators) when the signal was aborted. */
export class CancelledError extends Error {
  readonly code = 'CANCELLED';
  constructor() {
    super('Cancelled.');
    this.name = 'CancelledError';
  }
}

export interface CancelToken {
  readonly signal: CancelSignal;
  cancel(): void;
}

/** A token to pass as `signal`; call `cancel()` from anywhere (an `onProgress` callback, a timer, a button). */
export function createCancelToken(): CancelToken {
  const state = { aborted: false };
  return {
    signal: state,
    cancel() {
      state.aborted = true;
    },
  };
}

/** Throws `CancelledError` when the signal is aborted. */
export function throwIfCancelled(signal: CancelSignal | undefined): void {
  if (signal !== undefined && signal.aborted) throw new CancelledError();
}

/** Runs a step generator to its end, reporting nothing itself (the generator already calls `onProgress`). */
export function drain<T>(steps: Generator<Progress, T, void>): T {
  for (;;) {
    const next = steps.next();
    if (next.done) return next.value;
  }
}
