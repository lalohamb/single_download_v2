alter table orders add column if not exists shipments jsonb default '[]'::jsonb;
