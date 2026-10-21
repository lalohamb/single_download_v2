declare global {
  interface Window {
    gtag: (...args: unknown[]) => void;
    dataLayer: unknown[];
  }
}

export function gtag(...args: unknown[]) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag(...args);
  }
}

export function trackPageView(url: string, measurementId: string) {
  gtag("config", measurementId, { page_path: url });
}

export function trackViewItem(product: { id: string; title: string; price: number; category?: string }) {
  gtag("event", "view_item", {
    currency: "USD",
    value: product.price,
    items: [{ item_id: product.id, item_name: product.title, price: product.price, item_category: product.category }],
  });
}

export function trackAddToCart(product: { id: string; title: string; price: number; variantId: string; variantLabel: string; quantity: number }) {
  gtag("event", "add_to_cart", {
    currency: "USD",
    value: product.price * product.quantity,
    items: [{ item_id: product.id, item_name: product.title, item_variant: product.variantLabel, price: product.price, quantity: product.quantity }],
  });
}

export function trackBeginCheckout(items: Array<{ id: string; title: string; price: number; variantLabel: string; quantity: number }>, value: number) {
  gtag("event", "begin_checkout", {
    currency: "USD",
    value,
    items: items.map((i) => ({ item_id: i.id, item_name: i.title, item_variant: i.variantLabel, price: i.price, quantity: i.quantity })),
  });
}

export function trackPurchase(orderId: string, value: number, items: Array<{ id: string; title: string; price: number; variantLabel: string; quantity: number }>) {
  gtag("event", "purchase", {
    transaction_id: orderId,
    currency: "USD",
    value,
    items: items.map((i) => ({ item_id: i.id, item_name: i.title, item_variant: i.variantLabel, price: i.price, quantity: i.quantity })),
  });
}

export function trackSearch(searchTerm: string) {
  gtag("event", "search", { search_term: searchTerm });
}

export function trackSignUp(method = "email") {
  gtag("event", "sign_up", { method });
}

export function trackGenerateLead() {
  gtag("event", "generate_lead");
}
