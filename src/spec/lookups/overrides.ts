/**
 * TIS rows carry no name in the generated table (the source wraps it over several lines). The one a tooltip needs
 * is named in the 3.0 Lookup Table-05 row `2136 ... GROUP 2WL ... WORLD WORLD`.
 */
export const LABEL_OVERRIDES: Readonly<Record<string, Readonly<Record<string, string>>>> = { tis: { '2136': 'World' } };
