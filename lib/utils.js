/** Minimal cn helper for future React component integration. */
export function cn(...inputs) {
  return inputs.filter(Boolean).join(" ");
}
