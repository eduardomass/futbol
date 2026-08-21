-- =============================================================
-- Proyecto Futbol · Eliminar una fecha
--
-- No había forma de borrar un partido. Se puede crear una fecha de más
-- —un click de sobra, una fecha mal tipeada— y queda para siempre en el
-- listado. Peor: como los puntajes se cierran cuando existe una fecha
-- posterior (migración 0007), una fecha futura creada por error deja sin
-- editar los puntajes de la anterior. Justo lo que pasó con el 27/08.
--
-- `eliminar_partido` es **solo de admin** y no pide confirmación: el
-- `on delete cascade` de `partido_jugadores` y `puntajes` se lleva el
-- plantel y todos los votos de esa fecha. Devuelve qué se borró para que
-- la pantalla lo pueda avisar.
--
-- No distingue estado a propósito: sirve tanto para la fecha programada
-- de más como para una finalizada que se cargó dos veces. La pantalla es
-- la que tiene que pedir confirmación.
-- =============================================================

create or replace function public.eliminar_partido(p_token uuid, p_partido_id bigint)
returns table (fecha date, estado text, jugadores int, puntajes int)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_fecha     date;
  v_estado    text;
  v_jugadores int;
  v_puntajes  int;
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede eliminar una fecha';
  end if;

  select p.fecha, p.estado into v_fecha, v_estado
  from public.partidos p where p.id = p_partido_id;

  if v_fecha is null then
    raise exception 'No existe el partido %', p_partido_id;
  end if;

  select count(*)::int into v_jugadores
  from public.partido_jugadores pj where pj.partido_id = p_partido_id;
  select count(*)::int into v_puntajes
  from public.puntajes pt where pt.partido_id = p_partido_id;

  delete from public.partidos where id = p_partido_id;

  return query select v_fecha, v_estado, v_jugadores, v_puntajes;
end;
$fn$;

revoke all on function public.eliminar_partido(uuid, bigint) from public;
grant execute on function public.eliminar_partido(uuid, bigint) to anon, authenticated;
