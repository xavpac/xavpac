export type TVScene = "city" | "airport" | "approach" | "ambience";

export type TVSequenceItem = {
  id: string;
  url: string;
  type: "video" | "image";
  scene?: TVScene;
};

// A visual journey rather than a shuffled image dump: city video, airport,
// city view, aviation footage, landmark, then another destination viewpoint.
// Missing categories are skipped; no placeholders or invented footage.
const PROGRAM: ReadonlyArray<{ scene: TVScene; type: "video" | "image" }> = [
  { scene: "city", type: "video" },
  { scene: "airport", type: "image" },
  { scene: "city", type: "image" },
  { scene: "approach", type: "video" },
  { scene: "ambience", type: "image" },
  { scene: "airport", type: "video" },
  { scene: "city", type: "image" },
  { scene: "airport", type: "image" },
  { scene: "ambience", type: "video" },
  { scene: "ambience", type: "image" }
];

export function composeTvSequence<T extends TVSequenceItem>(
  assets: readonly T[], cycle = 0, maxCount = 46
): T[] {
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const unique = assets.filter((item) => {
    if (!item.url.startsWith("https://") || seenIds.has(item.id) || seenUrls.has(item.url)) return false;
    seenIds.add(item.id);
    seenUrls.add(item.url);
    return true;
  });
  const remaining = [...unique];
  const ordered: T[] = [];
  const shift = Math.max(0, Math.floor(cycle));

  // Rotate within each class for the next cycle while keeping cinematic order.
  for (const scene of ["city", "airport", "approach", "ambience"] as TVScene[]) {
    for (const type of ["video", "image"] as const) {
      const positions = remaining.flatMap((item, index) =>
        (item.scene ?? "city") === scene && item.type === type ? [index] : []);
      if (positions.length > 1) {
        const selected = positions.map((position) => remaining[position]);
        positions.forEach((position, index) => {
          remaining[position] = selected[(index + shift) % selected.length];
        });
      }
    }
  }

  let step = 0;
  while (remaining.length && ordered.length < maxCount) {
    const goal = PROGRAM[step % PROGRAM.length];
    let choice = remaining.findIndex((item) =>
      (item.scene ?? "city") === goal.scene && item.type === goal.type);
    if (choice < 0) {
      const previous = ordered[ordered.length - 1];
      choice = remaining.findIndex((item) =>
        item.type !== previous?.type && item.scene !== previous?.scene);
      if (choice < 0) choice = remaining.findIndex((item) => item.type !== previous?.type);
      if (choice < 0) choice = remaining.findIndex((item) => item.scene !== previous?.scene);
      if (choice < 0) choice = 0;
    }
    ordered.push(remaining.splice(choice, 1)[0]);
    step += 1;
  }
  return ordered;
}
