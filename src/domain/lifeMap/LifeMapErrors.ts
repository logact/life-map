export type LifeMapErrorCode =
  | 'duplicate-id'
  | 'invalid-origin'
  | 'missing-reference'
  | 'invalid-record-target'
  | 'cycle'
  | 'invalid-road'
  | 'invalid-segment'
  | 'invalid-operation'
  | 'history-protected'
  | 'version-conflict';

export class LifeMapError extends Error {
  constructor(
    readonly code: LifeMapErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'LifeMapError';
  }
}

export const invariant: (
  condition: unknown,
  code: LifeMapErrorCode,
  message: string,
  details?: Record<string, unknown>,
) => asserts condition = (
  condition: unknown,
  code: LifeMapErrorCode,
  message: string,
  details: Record<string, unknown> = {},
): asserts condition => {
  if (!condition) {
    throw new LifeMapError(code, message, details);
  }
};
