export {};

declare global {
  interface Window {
    __affiliateCode?: string | null;
    __attribution?: { first_touch: unknown; last_touch: unknown } | null;
  }
}
