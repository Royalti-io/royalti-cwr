import type { CwrVersion } from '../model/types';
import type { RuleDef, RuleRegistry } from './types';

/**
 * Identity helper that gives a rule literal its type and checks the parts a typo could break.
 * Adding a rule is: write a `defineRule({...})`, put it in a list, add that list to `BUILTIN_RULES`.
 */
export function defineRule(rule: RuleDef): RuleDef {
  if (rule.id.trim() === '' || rule.id !== rule.id.trim()) throw new Error(`rule id is empty or padded: "${rule.id}"`);
  if (rule.versions.length === 0) throw new Error(`rule ${rule.id} runs on no version`);
  if (rule.source.slug === '') throw new Error(`rule ${rule.id} has no citation`);
  if (rule.secondary && (rule.severity !== 'warning' || !rule.source.slug.startsWith('secondary/'))) {
    throw new Error(`rule ${rule.id}: a secondary-source rule is a warning and names its source as secondary/...`);
  }
  if (rule.scope !== 'field' && rule.fields) throw new Error(`rule ${rule.id}: only field rules take a field filter`);
  return rule;
}

/** A registry over a fixed list of rules. Ids must be unique. Rules run in the order given. */
export function createRegistry(rules: readonly RuleDef[]): RuleRegistry {
  const byId = new Map<string, RuleDef>();
  for (const rule of rules) {
    if (byId.has(rule.id)) throw new Error(`duplicate rule id ${rule.id}`);
    byId.set(rule.id, rule);
  }
  const byVersion = new Map<CwrVersion, readonly RuleDef[]>();
  return {
    rules,
    get: id => byId.get(id),
    forVersion(version) {
      let list = byVersion.get(version);
      if (!list) {
        list = rules.filter(r => r.versions.includes(version));
        byVersion.set(version, list);
      }
      return list;
    },
  };
}
