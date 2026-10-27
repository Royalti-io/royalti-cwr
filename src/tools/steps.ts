import { throwIfCancelled } from '../model/progress';
import type { Progress, ProgressTask, RunOptions } from '../model/progress';

/**
 * Progress reporting for the tools that run as step generators (`extractWorksSteps`, `worksCsvSteps`, `ownedSharesSteps`,
 * `findDuplicatesSteps`). It is the same contract as `checkSteps`: the generator yields a `Progress` between steps, and a
 * host stops the run by not calling `next()` again (or by calling `return()`). Nothing is held outside the generator, and the
 * document is never written to, so a stopped run leaves nothing behind.
 */

/** Items between two reports (and two cancel checks) for the tools that visit one work at a time. */
export const WORK_STEP = 256;
/** Records or lines between two reports for the passes over a whole file. */
export const RECORD_STEP = 2048;

export type Stepper = (stage: string, done: number, total: number, from: number, to: number) => Progress;

/**
 * Builds the report for one step: checks the signal, calls `onProgress`, checks the signal again, and returns the object the
 * generator yields. `fraction` runs from `from` to `to` across the stage and never goes down as long as `done` does not.
 */
export function stepper(task: ProgressTask, options: RunOptions): Stepper {
  return (stage, done, total, from, to) => {
    throwIfCancelled(options.signal);
    const p: Progress = { task, stage, done, total, fraction: total > 0 ? from + (to - from) * Math.min(1, done / total) : to };
    options.onProgress?.(p);
    throwIfCancelled(options.signal);
    return p;
  };
}
