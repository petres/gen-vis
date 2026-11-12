# To do: not reviewed

The outside review of 2026-11-12 did not look at these parts, or only read them:

- maps (`coord: geo`): the drawing, the hover, the projections;
- polar charts beyond a pie and a smoke test of the edge cases;
- parquet data;
- `domainIgnores`;
- labels placed inside areas (`place: {in}`);
- the `highlight` prop and `setHighlight`, hover `mode: point`, legends of `onlyData`;
- `genVisExport` called directly (the CLI was tested), the slots of the core without Vue;
- a TypeScript compile against `types/` (read by eye against the code), a webpack build;
- parents, mixins and `match` beyond the documented cases;
- the reverse comparison "accepted by the code but not in the schema";
- the Default column of `docs/reference.md` (filled for about ten keys, the other defaults are only
  in the text).
