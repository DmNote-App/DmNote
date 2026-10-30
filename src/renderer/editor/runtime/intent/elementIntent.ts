import type { NativeElementType } from '../../model/elementIdMap';

export interface ElementIntentReceipt {
  rollback: () => void;
}

export class ElementIntentAbort extends Error {
  constructor(reason: string) {
    super(`element intent aborted: ${reason}`);
    this.name = 'ElementIntentAbort';
  }
}

export const isElementIntentAbort = (
  error: unknown,
): error is ElementIntentAbort =>
  error instanceof Error && error.name === 'ElementIntentAbort';

export type PropertyIntents = ReadonlyMap<
  NativeElementType,
  ReadonlyMap<string, Record<string, unknown>>
>;

export const reportElementOpError = (error: unknown): void => {
  console.error('Element operation failed', error);
};

// fail-closed 무커밋은 오류가 아니라 정상 resolve - 별도 관측 경로
export const reportElementOpSkipped = (context: string): void => {
  console.warn('Element operation skipped (fail-closed)', context);
};
