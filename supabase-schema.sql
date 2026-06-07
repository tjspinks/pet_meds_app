-- ============================================================
-- Vet Tracker — Full Schema v4 + Migration
-- Safe to run fresh. For existing DBs, see migration section.
-- ============================================================

-- ── Core tables ───────────────────────────────────────────────

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

-- metric_definitions: the catalogue of known metrics
create table if not exists metric_definitions (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,   -- e.g. 'weight_kg', 'temp_f'
  label        text not null,          -- e.g. 'Weight', 'Temperature'
  unit         text,                   -- e.g. 'kg', '°F', 'cm'
  is_dose_weight boolean default false, -- if true, used for dose calculation
  display_order int default 99,
  created_at   timestamptz default now()
);

-- exams: one row per exam session per animal
create table if not exists exams (
  id          uuid primary key default gen_random_uuid(),
  animal_name text not null,
  notes       text,
  recorded_at timestamptz default now()
);

-- exam_metrics: one row per metric per exam
create table if not exists exam_metrics (
  id        uuid primary key default gen_random_uuid(),
  exam_id   uuid not null references exams(id) on delete cascade,
  metric    text not null,   -- matches metric_definitions.key
  value     numeric not null,
  unit      text
);

create table if not exists treatments (
  id          uuid primary key default gen_random_uuid(),
  animal_name text not null,
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
create index if not exists idx_exams_animal        on exams        (animal_name, recorded_at desc);
create index if not exists idx_exam_metrics_exam   on exam_metrics (exam_id);
create index if not exists idx_exam_metrics_metric on exam_metrics (metric);
create index if not exists idx_treatments_animal   on treatments   (animal_name, created_at desc);

-- ── Seed metric definitions ───────────────────────────────────
insert into metric_definitions (key, label, unit, is_dose_weight, display_order) values
  ('weight_kg',   'Weight',       'kg',  true,  1),
  ('length_cm',   'Length',       'cm',  false, 2),
  ('temp_f',      'Temperature',  '°F',  false, 3),
  ('age_weeks',   'Age',          'wks', false, 4)
on conflict (key) do update
  set label = excluded.label,
      unit  = excluded.unit,
      is_dose_weight = excluded.is_dose_weight,
      display_order  = excluded.display_order;

-- ── Seed medications ──────────────────────────────────────────
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
  set factor        = excluded.factor,
      concentration = excluded.concentration,
      indication    = excluded.indication;

-- ── Migration: animals from treatments ───────────────────────
insert into animals (name)
select distinct animal_name from treatments
where  animal_name is not null and animal_name <> ''
on conflict (name) do nothing;

-- ── Migration: weight_logs → exams + exam_metrics ────────────
-- Only runs if weight_logs table exists and has rows.
do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_name = 'weight_logs'
  ) then
    -- Create one exam per weight_log entry
    insert into exams (id, animal_name, recorded_at)
    select gen_random_uuid(), animal_name, recorded_at
    from   weight_logs
    where  not exists (
      select 1 from exams e
      where  e.animal_name = weight_logs.animal_name
    );

    -- Insert weight_kg metric for each migrated exam
    -- Match by animal_name and recorded_at
    insert into exam_metrics (exam_id, metric, value, unit)
    select e.id, 'weight_kg', wl.weight_kg, 'kg'
    from   weight_logs wl
    join   exams e
           on  e.animal_name = wl.animal_name
           and e.recorded_at = wl.recorded_at
    where  not exists (
      select 1 from exam_metrics em where em.exam_id = e.id
    );
  end if;
end $$;

-- ── Migration: old treatments with weight column ──────────────
-- If treatments still has a weight or weight_kg column,
-- create exams for animals that have no exams yet.
do $$
declare
  has_weight_kg boolean;
  has_weight    boolean;
begin
  select exists(
    select 1 from information_schema.columns
    where table_name='treatments' and column_name='weight_kg'
  ) into has_weight_kg;

  select exists(
    select 1 from information_schema.columns
    where table_name='treatments' and column_name='weight'
  ) into has_weight;

  if has_weight_kg then
    insert into exams (animal_name, recorded_at)
    select distinct on (animal_name) animal_name, created_at
    from   treatments
    where  weight_kg is not null
      and  not exists (
        select 1 from exams e where e.animal_name = treatments.animal_name
      )
    order  by animal_name, created_at desc;

    insert into exam_metrics (exam_id, metric, value, unit)
    select e.id, 'weight_kg',
           (select weight_kg from treatments t2
            where t2.animal_name = e.animal_name
            order by t2.created_at desc limit 1),
           'kg'
    from   exams e
    where  not exists (select 1 from exam_metrics em where em.exam_id = e.id);

  elsif has_weight then
    insert into exams (animal_name, recorded_at)
    select distinct on (animal_name) animal_name, created_at
    from   treatments
    where  weight is not null
      and  not exists (
        select 1 from exams e where e.animal_name = treatments.animal_name
      )
    order  by animal_name, created_at desc;

    insert into exam_metrics (exam_id, metric, value, unit)
    select e.id, 'weight_kg',
           round((
             select weight from treatments t2
             where t2.animal_name = e.animal_name
             order by t2.created_at desc limit 1
           ) / 2.205, 3),
           'kg'
    from   exams e
    where  not exists (select 1 from exam_metrics em where em.exam_id = e.id);
  end if;
end $$;

-- ── Row Level Security ────────────────────────────────────────
alter table medications         enable row level security;
alter table animals             enable row level security;
alter table metric_definitions  enable row level security;
alter table exams               enable row level security;
alter table exam_metrics        enable row level security;
alter table treatments          enable row level security;
alter table settings            enable row level security;

drop policy if exists "allow all medications"        on medications;
drop policy if exists "allow all animals"            on animals;
drop policy if exists "allow all metric_definitions" on metric_definitions;
drop policy if exists "allow all exams"              on exams;
drop policy if exists "allow all exam_metrics"       on exam_metrics;
drop policy if exists "allow all treatments"         on treatments;
drop policy if exists "allow all settings"           on settings;

create policy "allow all medications"        on medications        for all using (true) with check (true);
create policy "allow all animals"            on animals            for all using (true) with check (true);
create policy "allow all metric_definitions" on metric_definitions for all using (true) with check (true);
create policy "allow all exams"              on exams              for all using (true) with check (true);
create policy "allow all exam_metrics"       on exam_metrics       for all using (true) with check (true);
create policy "allow all treatments"         on treatments         for all using (true) with check (true);
create policy "allow all settings"           on settings           for all using (true) with check (true);

-- ── Storage bucket reminder ───────────────────────────────────
-- Supabase → Storage → New bucket: animal-photos (public)
