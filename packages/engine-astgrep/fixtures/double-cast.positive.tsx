declare const value: unknown

// Proves the `language: Tsx` document exists: a `language: TypeScript` document does not match
// a .tsx file at all, and the failure mode is silence rather than an error.
export const Component = () => <div>{value as unknown as string}</div> // SLOP_HIT
