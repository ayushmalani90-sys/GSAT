-- Atomic, server-only candle upsert with insert/update counts for ingestion telemetry.
create or replace function public.gsat_upsert_market_candles(p_rows jsonb)
returns table(inserted_count bigint, updated_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'p_rows must be a JSON array';
  end if;

  return query
  with payload as (
    select
      r.symbol,
      r.timeframe,
      r.candle_open,
      r.open_price,
      r.high_price,
      r.low_price,
      r.close_price,
      r.volume,
      r.tick_volume,
      coalesce(r.source, 'BiQuote') as source,
      coalesce(r.last_ingested_at, now()) as last_ingested_at
    from jsonb_to_recordset(p_rows) as r(
      symbol text,
      timeframe text,
      candle_open timestamptz,
      open_price double precision,
      high_price double precision,
      low_price double precision,
      close_price double precision,
      volume double precision,
      tick_volume bigint,
      source text,
      last_ingested_at timestamptz
    )
  ),
  upserted as (
    insert into public.gsat_market_candles (
      symbol, timeframe, candle_open,
      open_price, high_price, low_price, close_price,
      volume, tick_volume, source, last_ingested_at
    )
    select
      symbol, timeframe, candle_open,
      open_price, high_price, low_price, close_price,
      volume, tick_volume, source, last_ingested_at
    from payload
    on conflict (symbol, timeframe, candle_open)
    do update set
      open_price = excluded.open_price,
      high_price = excluded.high_price,
      low_price = excluded.low_price,
      close_price = excluded.close_price,
      volume = excluded.volume,
      tick_volume = excluded.tick_volume,
      source = excluded.source,
      last_ingested_at = excluded.last_ingested_at
    returning (xmax = 0) as was_inserted
  )
  select
    count(*) filter (where was_inserted),
    count(*) filter (where not was_inserted)
  from upserted;
end;
$$;

revoke all on function public.gsat_upsert_market_candles(jsonb) from public, anon, authenticated;
grant execute on function public.gsat_upsert_market_candles(jsonb) to service_role;
