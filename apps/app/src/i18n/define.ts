// One namespace file is `export const <ns> = defineMessages({ en: { ... }, de: { ... } })`.
// TypeScript rejects a de without every en key and a de with a key en does not have.
type Shape<E extends Record<string, string>> = { [K in keyof E]: string };

export function defineMessages<const E extends Record<string, string>, const D extends Record<string, string>>(m: {
  en: E;
  de: Shape<E> & D & { [K in Exclude<keyof D, keyof E>]: never };
}): { en: E; de: Shape<E> } {
  return m;
}
