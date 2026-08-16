-- =============================================================
-- Proyecto Futbol · Limpieza de datos de prueba
--
-- `scripts/prueba-e2e.mjs` corre contra la base real y crea jugadores y
-- un partido de prueba. Antes no podía borrarlos, porque RLS bloquea el
-- DELETE desde el cliente, y quedaban mezclados con los datos reales.
--
-- Esta función le da al script una vía de limpieza acotada: solo toca
-- filas cuyo email termina en `@prueba.local`, patrón que ningún jugador
-- real usa. Restringida a administradores.
-- =============================================================

create or replace function public.limpiar_datos_prueba(p_token uuid)
returns table (jugadores_borrados int, partidos_borrados int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_partidos int;
  v_jugadores int;
begin
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede limpiar los datos de prueba';
  end if;

  -- Partidos donde participó algún jugador de prueba. El cascade se lleva
  -- puestos partido_jugadores y puntajes.
  with borrados as (
    delete from public.partidos p
    where exists (
      select 1 from public.partido_jugadores pj
      join public.jugadores j on j.id = pj.jugador_id
      where pj.partido_id = p.id and j.email like '%@prueba.local')
    returning 1)
  select count(*)::int into v_partidos from borrados;

  delete from public.sesiones s
  using public.jugadores j
  where s.jugador_id = j.id and j.email like '%@prueba.local';

  with borrados as (
    delete from public.jugadores where email like '%@prueba.local' returning 1)
  select count(*)::int into v_jugadores from borrados;

  return query select v_jugadores, v_partidos;
end;
$fn$;

revoke all on function public.limpiar_datos_prueba(uuid) from public;
grant execute on function public.limpiar_datos_prueba(uuid) to anon, authenticated;
