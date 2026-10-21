alter table settings
  add column if not exists newsletter_consent_text text
    default 'Yes, send me new drops and exclusive offers. Unsubscribe anytime.';
