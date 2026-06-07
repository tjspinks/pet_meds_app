-- Run this in your Supabase dashboard under SQL Editor
-- Project: rvvrxpjwrfijxnholdos

-- Medications table
create table if not exists medications (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  factor numeric not null,
  created_at timestamptz default now()
);

-- Treatments table
create table if not exists treatments (
  id uuid primary key default gen_random_uuid(),
  animal_name text not null,
  weight numeric not null,
  medication text not null,
  dose numeric not null,
  created_at timestamptz default now()
);

-- Seed default medications
insert into medications (name, factor) values
  ('Toltrazuril (standard)', 0.05),
  ('Toltrazuril 5%', 0.18),
  ('Diclazuril 1%', 0.05),
  ('Metronidazole 10%', 0.72),
  ('Tylosin 10%', 0.05)
on conflict (name) do nothing;

-- Row Level Security (open for now — add auth later to lock down)
alter table medications enable row level security;
alter table treatments enable row level security;

-- Allow all operations for anon key (single-user setup, no auth yet)
create policy "allow all medications" on medications for all using (true) with check (true);
create policy "allow all treatments" on treatments for all using (true) with check (true);
