// Merging two ranked result lists (keyword search and meaning search) into one.
//
// Reciprocal rank fusion scores each item by its position in each list: 1 / (k + position). It
// needs no comparison between the lists' own scores, which are on different scales (a text-match
// rank and a vector distance), and an item found by both lists rises above one found by only one.

const K = 60;

export function fuseRanked<T>(lists: T[][], idOf: (item: T) => number): T[] {
  const scores = new Map<number, number>();
  const items = new Map<number, T>();
  for (const list of lists) {
    list.forEach((item, position) => {
      const id = idOf(item);
      scores.set(id, (scores.get(id) ?? 0) + 1 / (K + position + 1));
      if (!items.has(id)) items.set(id, item);
    });
  }
  return [...items.keys()].sort((a, b) => scores.get(b)! - scores.get(a)! || b - a).map((id) => items.get(id)!);
}
