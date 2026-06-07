-- ============================================================
-- Vet Tracker — Full Schema + Migration
-- Run this in Supabase SQL Editor (safe to re-run)
-- ============================================================

-- ── Tables ────────────────────────────────────────────────────

create table if not exists medications (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  factor        numeric not null,
  concentration text,
  indication    text,
  created_at    timestamptz default now()
);

create table if not exists animals (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  photo_url  text,
  notes      text,
  created_at timestamptz default now()
);

-- weight_logs: independent weight entries, not tied to treatments
create table if not exists weight_logs (
  id          uuid primary key default gen_random_uuid(),
  animal_name text not null,
  weight_kg   numeric not null,
  weight_lbs  numeric generated always as (round((weight_kg * 2.205)::numeric, 2)) stored,
  recorded_at timestamptz default now()
);

create table if not exists treatments (
  id          uuid primary key default gen_random_uuid(),
  animal_name text not null,
  weight_kg   numeric not null,
  weight_lbs  numeric generated always as (round((weight_kg * 2.205)::numeric, 2)) stored,
  medication  text not null,
  dose        numeric not null,
  notes       text,
  created_at  timestamptz default now()
);

create table if not exists settings (
  key   text primary key,
  value text not null
);

-- ── Indexes ───────────────────────────────────────────────────
create index if not exists idx_weight_logs_animal   on weight_logs (animal_name, recorded_at desc);
create index if not exists idx_treatments_animal    on treatments  (animal_name, created_at  desc);

-- ── Seed medications from CSV ─────────────────────────────────
insert into medications (name, concentration, indication, factor) values
  ('Diclazuril 1%',                  '10 mg/mL',  'Coccidia',                             0.1102),
  ('Diclazuril 5%',                  '50 mg/mL',  'Coccidia',                             0.0999),
  ('Metronidazole 10% HIGH',         '100 mg/mL', 'Bacteria / Giardia',                   0.2646),
  ('Metronidazole 10% LOW',          '100 mg/mL', 'Bacteria / Giardia',                   0.2205),
  ('Ponazuril 10%',                  '100 mg/mL', 'Coccidia',                             0.2998),
  ('Praziquantel 5% HIGH',           '50 mg/mL',  'Tapeworms',                            0.2006),
  ('Praziquantel 5% LOW',            '50 mg/mL',  'Tapeworms',                            0.0992),
  ('Ronidazole 10%',                 '100 mg/mL', 'Tritrichomonas foetus',                0.2998),
  ('Selamectin 12%',                 '120 mg/mL', 'Fleas / Mites / Hookworms',            0.0507),
  ('Toltrazuril (standard)',         '50 mg/mL',  'Coccidia',                             0.1102),
  ('Toltrazuril 5%',                 '50 mg/mL',  'Coccidia',                             0.3968),
  ('Toltrazuril 10%',                '100 mg/mL', 'Coccidia (Concentrated)',              0.2205),
  ('Tylosin 10%',                    '100 mg/mL', 'Clostridium / IBIP',                   0.1102),
  ('Tinidazole 5%',                  '50 mg/mL',  'Giardia / Resistant Protozoa',         0.5997),
  ('Fenbendazole 10% (Clean Sweep)', '100 mg/mL', 'Roundworms / Hookworms',               0.5004),
  ('Nitenpyram 5% (Flea Shield)',    '50 mg/mL',  'Fleas (Rapid Action)',                 0.0198),
  ('Ivermectin 1% Liquid',           '10 mg/mL',  'Mites / Heartworm Microfilaria',       0.0441),
  ('Spectinomycin 5%',               '50 mg/mL',  'Enteritis / Bacterial Gut Infections', 0.4409)
on conflict (name) do update
  set factor = excluded.factor,
      concentration = excluded.concentration,
      indication = excluded.indication;

-- ── Migration: animals from existing treatments ───────────────
-- Inserts one row per distinct animal_name found in treatments.
-- Safe to run even if animals table already has rows (skips conflicts).
insert into animals (name)
select distinct animal_name
from   treatments
where  animal_name is not null
  and  animal_name <> ''
on conflict (name) do nothing;

-- ── Migration: backfill weight_logs from treatments ───────────
-- One weight_log entry per treatment, using that treatment's
-- weight and timestamp. Skips duplicates via the unique index
-- on (animal_name, recorded_at) if you re-run.
-- Uses a DO block so we can check if weight_logs is empty first.
do $$
begin
  if not exists (select 1 from weight_logs limit 1) then
    insert into weight_logs (animal_name, weight_kg, recorded_at)
    select animal_name,
           weight_kg,
           created_at   -- preserves original treatment timestamp
    from   treatments
    where  weight_kg is not null;
  end if;
end $$;

-- ── Row Level Security ────────────────────────────────────────
alter table medications  enable row level security;
alter table animals      enable row level security;
alter table weight_logs  enable row level security;
alter table treatments   enable row level security;
alter table settings     enable row level security;

-- Drop and recreate policies cleanly
drop policy if exists "allow all medications" on medications;
drop policy if exists "allow all animals"     on animals;
drop policy if exists "allow all weight_logs" on weight_logs;
drop policy if exists "allow all treatments"  on treatments;
drop policy if exists "allow all settings"    on settings;

create policy "allow all medications"  on medications  for all using (true) with check (true);
create policy "allow all animals"      on animals      for all using (true) with check (true);
create policy "allow all weight_logs"  on weight_logs  for all using (true) with check (true);
create policy "allow all treatments"   on treatments   for all using (true) with check (true);
create policy "allow all settings"     on settings     for all using (true) with check (true);

-- ── Storage bucket reminder ───────────────────────────────────
-- Create manually in Supabase → Storage → New bucket:
--   Name: animal-photos   Public: yes
