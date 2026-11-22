drop function if exists public.gsat_import_external_research_candles(jsonb, integer, integer, integer, timestamptz, timestamptz);

create function public.gsat_import_external_research_candles(
  p_symbol text,
  p_rows jsonb,
  p_fetched_count integer,
  p_rejected_count integer,
  p_request_weight integer,
  p_requested_start timestamptz,
  p_requested_end timestamptz
)
returns table (run_id bigint, inserted_count bigint, updated_count bigint, rejected_count bigint)
language plpgsql
security definer
set search_path = pg_catalog, public, research
as $$
declare
  v_run_id bigint;
  v_inserted bigint := 0;
  v_updated bigint := 0;
  v_row record;
  v_inserted_flag boolean;
begin
  if p_symbol not in ('XAG', 'XAU') then raise exception 'Only XAG and XAU are allowed'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'p_rows must be a JSON array'; end if;
  if jsonb_array_length(p_rows) > 100 then raise exception 'Too many rows in one batch'; end if;
  if coalesce(p_fetched_count, 0) < 0 or coalesce(p_rejected_count, 0) < 0 or coalesce(p_request_weight, 0) < 0 then
    raise exception 'Import counters cannot be negative';
  end if;

  insert into research.gsat_external_ingestion_runs
    (source, symbol, timeframe, requested_start, requested_end, status, request_weight, fetched_count, rejected_count)
  values ('MetalCharts', p_symbol, '1d', p_requested_start, p_requested_end, 'running', p_request_weight, p_fetched_count, p_rejected_count)
  returning id into v_run_id;

  for v_row in
    select * from jsonb_to_recordset(p_rows) as x(
      candle_open timestamptz, open_price numeric, high_price numeric,
      low_price numeric, close_price numeric, volume numeric, raw_payload jsonb
    )
  loop
    if v_row.candle_open is null or v_row.open_price is null or v_row.high_price is null
       or v_row.low_price is null or v_row.close_price is null
       or v_row.open_price <= 0 or v_row.high_price <= 0 or v_row.low_price <= 0 or v_row.close_price <= 0
       or v_row.high_price < greatest(v_row.open_price, v_row.close_price, v_row.low_price)
       or v_row.low_price > least(v_row.open_price, v_row.close_price, v_row.high_price)
       or (v_row.volume is not null and v_row.volume < 0) then
      raise exception 'Invalid OHLC row in research import';
    end if;

    insert into research.gsat_external_candles
      (source, symbol, timeframe, candle_open, open_price, high_price, low_price, close_price,
       volume, volume_semantics, currency, price_unit, raw_payload, retrieved_at)
    values ('MetalCharts', p_symbol, '1d', v_row.candle_open, v_row.open_price, v_row.high_price,
      v_row.low_price, v_row.close_price, v_row.volume, 'provider_reported_not_exchange_volume',
      'USD', 'troy_ounce', v_row.raw_payload, now())
    on conflict (source, symbol, timeframe, candle_open) do update set
      open_price = excluded.open_price, high_price = excluded.high_price,
      low_price = excluded.low_price, close_price = excluded.close_price,
      volume = excluded.volume, volume_semantics = excluded.volume_semantics,
      currency = excluded.currency, price_unit = excluded.price_unit,
      raw_payload = excluded.raw_payload, retrieved_at = now()
    returning (xmax = 0) into v_inserted_flag;

    if v_inserted_flag then v_inserted := v_inserted + 1; else v_updated := v_updated + 1; end if;
  end loop;

  update research.gsat_external_ingestion_runs
  set finished_at = now(), status = 'succeeded', inserted_count = v_inserted, updated_count = v_updated,
      details = jsonb_build_object('provider','MetalCharts','symbol',p_symbol,'timeframe','1d',
        'currency','USD','unit','toz','attributionRequiredForPublicDisplay',true,'productionCandlesTouched',false)
  where id = v_run_id;

  return query select v_run_id, v_inserted, v_updated, coalesce(p_rejected_count, 0)::bigint;
end;
$$;

revoke all on function public.gsat_import_external_research_candles(text, jsonb, integer, integer, integer, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.gsat_import_external_research_candles(text, jsonb, integer, integer, integer, timestamptz, timestamptz) to service_role;
