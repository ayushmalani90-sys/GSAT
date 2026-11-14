-- Restrict the candle-retention maintenance function to the server role.
-- The table itself is RLS-protected and client roles have no DELETE grant;
-- this also removes the unnecessary direct EXECUTE grants on the function.
revoke all on function public.gsat_prune_market_candles() from public, anon, authenticated;
grant execute on function public.gsat_prune_market_candles() to service_role;
