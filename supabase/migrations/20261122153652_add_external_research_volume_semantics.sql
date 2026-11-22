alter table research.gsat_external_candles
  add column if not exists volume_semantics text not null
  default 'provider_reported_not_exchange_volume';

comment on column research.gsat_external_candles.volume is
  'Provider-reported volume only. Do not interpret as centralized exchange-traded volume or MCX volume.';
comment on column research.gsat_external_candles.volume_semantics is
  'Explicit warning that external provider volume is not validated exchange volume.';
