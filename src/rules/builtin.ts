import { CONDITIONAL_RULES } from './defs/conditional';
import { ENCODING_RULES } from './defs/encoding';
import { FORMAT_RULES } from './defs/format';
import { IDENTIFIER_RULES } from './defs/identifiers';
import { LINK_RULES } from './defs/links';
import { LENGTH_RULES } from './defs/length';
import { LOOKUP_RULES } from './defs/lookups';
import { PREFIX_RULES } from './defs/prefix';
import { SHARE_RULES } from './defs/shares';
import { STRUCTURE_RULES } from './defs/structure';
import { TERRITORY_RULES } from './defs/territories';
import { VERSION_RULES } from './defs/version';
import { WRITER_RULES } from './defs/writers';
import { createRegistry } from './registry';
import type { RuleDef } from './types';

/**
 * Every built-in rule, in the order it runs. Part 1: structure, counts, format, conditionals, lookups.
 * Part 2: identifiers, shares, links, territories, version rules.
 */
export const BUILTIN_RULES: readonly RuleDef[] = [
  ...ENCODING_RULES,
  ...STRUCTURE_RULES,
  ...PREFIX_RULES,
  ...LENGTH_RULES,
  ...FORMAT_RULES,
  ...CONDITIONAL_RULES,
  ...LOOKUP_RULES,
  ...IDENTIFIER_RULES,
  ...SHARE_RULES,
  ...LINK_RULES,
  ...TERRITORY_RULES,
  ...VERSION_RULES,
  ...WRITER_RULES,
];

export const BUILTIN_REGISTRY = createRegistry(BUILTIN_RULES);
