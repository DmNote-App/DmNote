export type LooseRecord = Record<
  string,
  Array<{ id: string } & Record<string, unknown>>
>;

export const findInRecord = (
  record: LooseRecord,
  id: string,
): { mode: string; index: number } | null => {
  for (const [mode, list] of Object.entries(record)) {
    const index = list.findIndex((position) => position.id === id);
    if (index >= 0) return { mode, index };
  }
  return null;
};
