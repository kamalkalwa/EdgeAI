/**
 * Reciprocal Rank Fusion (ADR-005)
 *
 * Merges multiple ranked lists into a single ranked list using the formula:
 *   score(d) = Σ  1 / (k + rank(d, list_i) + 1)
 *
 * The constant k=60 was found empirically by Cormack et al. (2009) to provide
 * robust fusion across diverse retrieval methods.
 *
 * Usage:
 *   const merged = rrf([bm25Results, vectorResults], 60);
 */

// Only `id` is required — RRF only needs to identify items across lists.
// Removing the index signature allows passing any typed object with an `id` field
// (e.g. Chunk & { id: string }) without TypeScript widening conflicts.
export interface RankedItem {
  id: string;
}

/**
 * Fuse multiple ranked lists via RRF. Returns IDs sorted by fused score, highest first.
 */
export function rrf(lists: RankedItem[][], k = 60): string[] {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const current = scores.get(item.id) ?? 0;
      scores.set(item.id, current + 1 / (k + rank + 1));
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);
}

/**
 * Same as rrf() but also returns scores for debugging / logging.
 */
export function rrfWithScores(
  lists: RankedItem[][],
  k = 60
): Array<{ id: string; score: number }> {
  const scores = new Map<string, number>();

  for (const list of lists) {
    list.forEach((item, rank) => {
      const current = scores.get(item.id) ?? 0;
      scores.set(item.id, current + 1 / (k + rank + 1));
    });
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => ({ id, score }));
}
