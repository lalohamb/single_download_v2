I want to add a facebook pixel Add tothe admin/SEO for facebook pixel. allow use to tner pixel id. [What needs to be done
1. Install the Meta Pixel base code in the site's <head> tag, on every page. The exact snippet is
available in Meta Events Manager → Datasets → Bodyandsleeves.com → "Set up Meta Pixel."
2. Fire the PageView event automatically on every page load (included in the base code by default).
3. Add a Purchase event on the order confirmation / thank-you page, firing after a successful Stripe
checkout completes. Include:
• value (order total)
• currency (e.g., "USD")
4. Optional but recommended — add these events too:
• AddToCart — when a customer adds an item to cart
• InitiateCheckout — when a customer starts checkout
• ViewContent — when a customer views a product page]