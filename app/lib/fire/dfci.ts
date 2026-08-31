export type DfciCode = {
  raw: string;
  normalized: string;
  sector: string;
  square: string;
  subdivision: string | null;
  cell: string | null;
};

const DFCI_PATTERN = /(?:\bDFCI\b[\s:;,-]*)?\b([A-HJ-NP-Z]{2})[\s-]*(\d{2})(?:[\s-]*([A-HJ-NP-Z]))?(?:[\s-]*(\d))?\b/gi;

export function recognizeDfciCodes(text: string): DfciCode[] {
  const matches: DfciCode[] = [];
  for (const match of text.toUpperCase().matchAll(DFCI_PATTERN)) {
    const [, sector, square, subdivision, cell] = match;
    const parts = [sector, square, subdivision, cell].filter(Boolean);
    matches.push({
      raw: match[0].trim(),
      normalized: parts.join(" "),
      sector,
      square,
      subdivision: subdivision ?? null,
      cell: cell ?? null
    });
  }
  return [...new Map(matches.map((match) => [match.normalized, match])).values()];
}

export function describeDfciCode(code: DfciCode) {
  const details = [`secteur ${code.sector}`, `maille ${code.square}`];
  if (code.subdivision) details.push(`sous-maille ${code.subdivision}`);
  if (code.cell) details.push(`cellule ${code.cell}`);
  return details.join(" • ");
}
