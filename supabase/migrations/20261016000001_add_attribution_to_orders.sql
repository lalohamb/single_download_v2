alter table orders
  add column if not exists marketing_opt_in boolean not null default false,
  add column if not exists utm_source       text,
  add column if not exists utm_medium       text,
  add column if not exists utm_campaign     text,
  add column if not exists utm_content      text,
  add column if not exists utm_term         text,
  add column if not exists referrer         text,
  add column if not exists landing_page     text,
  add column if not exists first_touch      jsonb,
  add column if not exists last_touch       jsonb;

create index if not exists idx_orders_utm_source      on orders(utm_source);
create index if not exists idx_orders_utm_campaign    on orders(utm_campaign);
create index if not exists idx_orders_marketing_optin on orders(marketing_opt_in);
