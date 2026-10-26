import { fieldName, inAck22, isNewIn22, S21, S22 } from '../locate';
import { defineRule } from '../registry';
import type { RuleDef } from '../types';

/**
 * STR-LEN: record length against the layout.
 *
 * The spec says the record length must match the layout (ER). Real files trim trailing blanks, so the
 * severity depends on what the cut removes:
 * - longer than the layout (GRT: 24 or 37 characters; GRH: 26 or 28): error, the extra characters are underlined;
 * - shorter and the cut removes some or all of a mandatory field: error;
 * - shorter and only optional or conditional fields are cut: warning.
 * GRH at 26 characters and GRT at 24 are not reported: the model treats both as complete (the fields after
 * them are "Not used for CWR"), and an info note per group would stop a clean file from reading as clean.
 */
const strLen = defineRule({
  id: 'STR-LEN',
  title: 'Record length matches the layout',
  severity: 'error',
  scope: 'record',
  versions: ['2.1', '2.2'],
  specAction: 'ER',
  cisac: 'FIL F 009',
  message: '{type} is {length} characters; its layout is {expected}.',
  source: { slug: S21, quote: '' },
  alsoSource: [
    { slug: S22, quote: '' },
    { slug: S22, quote: '' },
  ],
  run(ctx) {
    const layout = ctx.layout;
    if (!layout) return;
    const len = ctx.text.length;
    const alsoValid = layout.alsoValid ?? [];
    const max = alsoValid.length > 0 ? Math.max(layout.fullLength, ...alsoValid) : layout.fullLength;
    const type = ctx.rec.type;

    if (len > max) {
      ctx.report({
        line: ctx.line,
        start: max,
        end: len,
        params: { type, length: len, expected: max },
        message: '{type} is {length} characters; its layout is {expected}. The characters after {expected} are extra.',
      });
      return;
    }
    if (len >= layout.fullLength || alsoValid.includes(len)) return;
    // [S: cisac/cwr-functional-spec-2-2]
    // A record in an ACK that stops where the 2.2-only fields begin is complete.
    if (inAck22(ctx) && layout.fields.every(f => f.end <= len || isNewIn22(layout.name, f.id))) return;

    const missing = layout.fields.find(f => f.req === 'M' && f.end > len);
    if (missing) {
      const name = fieldName(ctx.version, layout, missing.id);
      ctx.report({
        line: ctx.line,
        start: len,
        end: layout.fullLength,
        ghost: true,
        fieldId: missing.id,
        params: { type, length: len, expected: layout.fullLength, field: name },
        message: '{type} is {length} characters; its layout is {expected}. The record ends before the mandatory field {field} is complete.',
      });
    } else {
      ctx.report({
        line: ctx.line,
        start: len,
        end: layout.fullLength,
        ghost: true,
        severity: 'warning',
        params: { type, length: len, expected: layout.fullLength },
        message:
          '{type} is {length} characters; its layout is {expected}. Only optional or conditional fields are missing from the end, ' +
          'but the specification says the record length must match.',
      });
    }
  },
});

export const LENGTH_RULES: readonly RuleDef[] = [strLen];
