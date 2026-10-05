-- Run this in the Supabase SQL editor
create table products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  price numeric not null,
  image_url text,
  created_at timestamptz default now()
);

create table orders (
  id uuid default gen_random_uuid() primary key,
  email text not null,
  items jsonb not null,
  amount numeric not null,
  reference text unique,
  status text default 'pending',
  created_at timestamptz default now()
);

alter table products enable row level security;
alter table orders enable row level security;
create policy "products are public" on products for select using (true);

-- Sample products
insert into products (name, description, price, image_url) values
('Silk Wrap Dress', 'Elegant midi dress', 18500, 'https://images.unsplash.com/photo-1595777457583-95e059d581b8'),
('Matte Lipstick Set', 'Set of 4 shades', 7500, 'https://images.unsplash.com/photo-1586495777744-4413f21062fa'),
('Oversized Blazer', 'Structured fit blazer', 24000, 'https://images.unsplash.com/photo-1591369822096-ffd140ec948f'),
('Glow Palette', 'Highlighter palette', 12000, 'https://images.unsplash.com/photo-1512496015851-a90fb38ba796');
