/**
 * The documents the engine cites, by the slug that `Citation.slug` and `FieldInfo.slug` carry.
 * A CISAC member-portal link opens only for a logged-in CISAC member (`access: 'members'`); the title is what to show.
 */
export interface SourceInfo {
  title: string;
  /** Where the document is published, when it has a public or member-portal address. */
  url?: string;
  /** Who can open `url`. Absent means anyone. */
  access?: 'members';
  /** Edition or date as the document prints it, when the engine's docs record one. */
  edition?: string;
}

const PORTAL = 'https://members.cisac.org/CisacPortal/cisacDownloadFile.do?docId=';

export const SOURCES: Readonly<Record<string, SourceInfo>> = {
  'cisac/cwr-functional-spec-2-1': { title: 'CWR 2.1 functional specification', url: `${PORTAL}37079`, access: 'members', edition: 'CISAC, revision 8, 2019' },
  'cisac/cwr-functional-spec-2-2': { title: 'CWR 2.2 functional specification', url: `${PORTAL}37081`, access: 'members', edition: 'CISAC, revision 2, 2019' },
  'cisac/cwr-lookup-tables-crf020': { title: 'CWR lookup tables (CRF020)', url: `${PORTAL}13238`, access: 'members', edition: 'CISAC, 2008' },
  'cisac/cwr-3-0-lookup-table-05': { title: 'CWR 3.0 lookup tables (Table 05)', url: `${PORTAL}36327`, access: 'members' },
  'cisac/cwr-error-messages': { title: 'CWR error messages', url: `${PORTAL}13245`, access: 'members' },
  'cisac/cwr-user-manual-2011': { title: 'CWR user manual (2011)', url: `${PORTAL}22272`, access: 'members' },
  'gema/what-which-number': { title: 'GEMA: what is which number', url: 'https://www.gema.de/en/w/help/creators/membership/already-a-member/what-which-number' },
  'iswc/iswc-page': { title: 'The ISWC (iswc.org)', url: 'https://www.iswc.org/iswc' },
  'iswc/iswc-usage': { title: 'ISWC usage (iswc.org)', url: 'https://www.iswc.org/iswc-usage' },
  'secondary/ipi-check-digits': { title: 'IPI check-digit routine used by Royalti (a secondary source, not a CISAC text)' },
};

/** Title, address and edition of a cited document, or undefined for a slug the engine does not cite. */
export function sourceInfo(slug: string): SourceInfo | undefined {
  return Object.prototype.hasOwnProperty.call(SOURCES, slug) ? SOURCES[slug] : undefined;
}
