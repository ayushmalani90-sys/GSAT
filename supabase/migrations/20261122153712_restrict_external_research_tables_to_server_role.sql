create policy "server role only" on research.gsat_external_candles
  for all to service_role using (true) with check (true);
create policy "server role only" on research.gsat_external_ingestion_runs
  for all to service_role using (true) with check (true);

grant usage on schema research to service_role;
grant select, insert, update, delete on research.gsat_external_candles to service_role;
grant select, insert, update, delete on research.gsat_external_ingestion_runs to service_role;
grant usage, select on all sequences in schema research to service_role;
