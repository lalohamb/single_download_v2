const FIRST_TOUCH_KEY = "bs_first_touch";
const LAST_TOUCH_KEY = "bs_last_touch";

export interface TouchPoint {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer: string | null;
  landing_page: string | null;
  ts: number;
}

function readParams(): TouchPoint | null {
  if (typeof window === "undefined") return null;
  const p = new URLSearchParams(window.location.search);
  const source = p.get("utm_source");
  const medium = p.get("utm_medium");
  const campaign = p.get("utm_campaign");
  const content = p.get("utm_content");
  const term = p.get("utm_term");
  if (!source && !medium && !campaign) return null;
  return {
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content,
    utm_term: term,
    referrer: document.referrer || null,
    landing_page: window.location.pathname + window.location.search,
    ts: Date.now(),
  };
}

export function recordAttribution() {
  if (typeof window === "undefined") return;
  const touch = readParams();
  if (!touch) return;
  // First touch: write once, never overwrite
  if (!localStorage.getItem(FIRST_TOUCH_KEY)) {
    localStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(touch));
  }
  // Last touch: always overwrite
  localStorage.setItem(LAST_TOUCH_KEY, JSON.stringify(touch));
}

export function getAttribution(): { first_touch: TouchPoint | null; last_touch: TouchPoint | null } {
  if (typeof window === "undefined") return { first_touch: null, last_touch: null };
  try {
    const first = localStorage.getItem(FIRST_TOUCH_KEY);
    const last = localStorage.getItem(LAST_TOUCH_KEY);
    return {
      first_touch: first ? JSON.parse(first) : null,
      last_touch: last ? JSON.parse(last) : null,
    };
  } catch {
    return { first_touch: null, last_touch: null };
  }
}

export function clearAttribution() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(FIRST_TOUCH_KEY);
  localStorage.removeItem(LAST_TOUCH_KEY);
}
