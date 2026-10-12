-- Neon Postgres schema for Vatar Games Studio
-- One shared DB across all games, rows scoped by game_slug.

create table if not exists grants (
  id            bigserial primary key,
  game          text not null,
  player_id     text not null,
  product_id    text not null,
  purchase_id   text not null unique,
  amount        integer,
  mode          text not null default 'test', -- 'test' | 'live'
  granted_at    timestamptz not null default now()
);

create index if not exists grants_game_player_idx on grants (game, player_id);

create table if not exists saves (
  game          text not null,
  player_id     text not null,
  data          jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (game, player_id)
);

-- Dedupe for optional webhook nudges.
create table if not exists webhook_events (
  event_id      text primary key,
  game          text not null,
  received_at   timestamptz not null default now()
);

-- Multiplayer match results, posted by our own realtime server.
create table if not exists match_results (
  match_id      text primary key,
  game          text not null,
  winner_id     text,
  payload       jsonb not null default '{}'::jsonb,
  posted_at     timestamptz not null default now()
);
