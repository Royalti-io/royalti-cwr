import { fieldsOf, layoutFor, layoutLength } from '../spec/index';
import type { CwrVersion, FieldDef, LayoutProvider, RecordLayoutDef } from './types';

/**
 * Lengths that are legitimate besides the spec's full length, per layout key. Both come from
 * the length checks against the public sample and the notes on the
 * rows themselves:
 *
 * - GRH 26: the last field, Submission/Distribution Type (27, 2), is "...",
 *   so real files end the record at 26.
 * - GRT 24: the last two fields, Currency Indicator (25, 3) and Total Monetary Value (28, 10), sit under
 *   the spec heading "..."; GRT is 24 or 37.
 *
 * Nothing else is added. The trailing-blank trims the notes list for the sample (NWR 208, SPU 138,
 * PER 70) are planted defects and stay `short`.
 */
const ALSO_VALID: Readonly<Record<string, readonly number[]>> = { GRH: [26], GRT: [24] };

/** Spec rows to the model's 0-based, end-exclusive spans. Aggregate rows repeat their children and are left out. */
function buildLayout(version: CwrVersion, key: string): RecordLayoutDef | null {
  const fullLength = layoutLength(version, key);
  if (fullLength === undefined) return null;
  const fields: FieldDef[] = [];
  for (const f of fieldsOf(version, key)) {
    if (f.status === 'aggregate') continue;
    const def: FieldDef = {
      id: f.id,
      start: f.start - 1,
      end: f.start - 1 + f.size,
      format: f.format,
      req: f.req,
      status: f.status,
    };
    if (f.lookup !== undefined) def.lookup = f.lookup;
    fields.push(def);
  }
  const alsoValid = ALSO_VALID[key];
  return alsoValid ? { name: key, fullLength, alsoValid, fields } : { name: key, fullLength, fields };
}

const cache: Record<CwrVersion, Map<string, RecordLayoutDef | null>> = { '2.1': new Map(), '2.2': new Map() };

/**
 * Layouts from the generated field specification (`src/spec`). Aliases (REV, ISW, EXC, OPU, OWR, OPT,
 * OWT, NCT, NVT) resolve to the shared layout object, so `layout.name` is the layout key (`NWR` for
 * `REV`). A record type the spec does not know for the version has no layout and is not a record type.
 */
export const specLayouts: LayoutProvider = {
  getLayout(version, recordType) {
    const key = layoutFor(version, recordType);
    if (key === null) return null;
    const table = cache[version];
    let layout = table.get(key);
    if (layout === undefined) {
      layout = buildLayout(version, key);
      table.set(key, layout);
    }
    return layout;
  },
  isRecordType: (version, recordType) => layoutFor(version, recordType) !== null,
};
