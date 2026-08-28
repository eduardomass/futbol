-- =============================================================
-- Proyecto Futbol · Goles por jugador
--
-- `partidos.goles_a` / `goles_b` siguen siendo el resultado oficial de la
-- fecha. Lo que se agrega acá es la ATRIBUCIÓN: cuántos hizo cada uno de
-- los 10, en `partido_jugadores.goles`.
--
-- Los dos números se guardan por separado a propósito: un gol en contra
-- entra en el resultado del equipo pero no en la cuenta del goleador, así
-- que la suma individual no siempre coincide con el marcador. La pantalla
-- muestra el subtotal de cada equipo al lado del resultado y avisa cuando
-- no cierran, pero la base no lo bloquea — si lo hiciera, un gol en contra
-- sería imposible de cargar.
--
-- Quién y cuándo: cualquier sesión válida, con el partido en `en_curso` o
-- `finalizado`. No lleva la restricción de admin ni el cierre por fecha
-- posterior que tienen los puntajes: los goles son un hecho del partido,
-- no una opinión que haya que congelar para que nadie la retoque.
-- =============================================================

-- ============================================================
-- COLUMNA
-- ============================================================

-- Arranca en 0, no en null: un jugador sin goles cargados hizo cero goles.
alter table public.partido_jugadores
  add column if not exists goles integer not null default 0 check (goles >= 0);

-- ============================================================
-- PLANTEL: suma la columna `goles`
--
-- Cambia el tipo de retorno, así que hay que dropear antes del create y
-- volver a dar el grant.
-- ============================================================

drop function if exists public.plantel_partido(uuid, bigint);

create function public.plantel_partido(p_token uuid, p_partido_id bigint)
returns table (jugador_id bigint, nombre text, apellido text, apodo text, equipo text,
               promedio numeric, votos integer, goles integer)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  return query
    select j.id, j.nombre, j.apellido, j.apodo, pj.equipo,
           (select round(avg(pt.puntaje), 2) from public.puntajes pt
            where pt.partido_id = p_partido_id and pt.jugador_id = j.id),
           (select count(*)::int from public.puntajes pt
            where pt.partido_id = p_partido_id and pt.jugador_id = j.id),
           pj.goles
    from public.partido_jugadores pj
    join public.jugadores j on j.id = pj.jugador_id
    where pj.partido_id = p_partido_id
    order by pj.equipo, j.nombre, j.apellido;
end;
$fn$;

-- ============================================================
-- CARGA DE GOLES
--
-- p_goles: [{"jugador_id": 1, "goles": 2}, ...]. Acepta cargas parciales:
-- solo toca a los jugadores que llegan en el array, el resto queda como
-- estaba. Reenviar corrige, no acumula.
-- ============================================================

create or replace function public.guardar_goles(
  p_token      uuid,
  p_partido_id bigint,
  p_goles      jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estado     text;
  v_recibidos  int;
  v_distintos  int;
  v_ajenos     int;
  v_invalidos  int;
  v_filas      int;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado is null then
    raise exception 'No existe el partido %', p_partido_id;
  end if;
  if v_estado = 'programado' then
    raise exception 'Los goles se cargan recién cuando el partido comenzó';
  end if;

  if jsonb_typeof(p_goles) <> 'array' then
    raise exception 'Los goles tienen que llegar como un array de {jugador_id, goles}';
  end if;

  -- Un jugador repetido dejaría el resultado a suerte del orden del array.
  select count(*)::int, count(distinct (e ->> 'jugador_id'))::int
    into v_recibidos, v_distintos
  from jsonb_array_elements(p_goles) e;

  if v_recibidos <> v_distintos then
    raise exception 'Hay jugadores repetidos en la carga de goles';
  end if;

  select count(*)::int into v_ajenos
  from jsonb_array_elements(p_goles) e
  where (e ->> 'jugador_id')::bigint not in (
    select pj.jugador_id from public.partido_jugadores pj where pj.partido_id = p_partido_id
  );

  if v_ajenos > 0 then
    raise exception 'Hay % jugador(es) que no participaron de este partido', v_ajenos;
  end if;

  select count(*)::int into v_invalidos
  from jsonb_array_elements(p_goles) e
  where coalesce((e ->> 'goles')::int, 0) < 0;

  if v_invalidos > 0 then
    raise exception 'Los goles tienen que ser números mayores o iguales a cero';
  end if;

  with datos as (
    select (e ->> 'jugador_id')::bigint     as jugador_id,
           coalesce((e ->> 'goles')::int, 0) as goles
    from jsonb_array_elements(p_goles) e
  )
  update public.partido_jugadores pj
  set goles = d.goles
  from datos d
  where pj.partido_id = p_partido_id
    and pj.jugador_id = d.jugador_id;

  get diagnostics v_filas = row_count;
  return v_filas;
end;
$fn$;

-- ============================================================
-- PERMISOS
-- ============================================================

revoke all on function public.plantel_partido(uuid, bigint) from public;
grant execute on function public.plantel_partido(uuid, bigint) to anon, authenticated;

revoke all on function public.guardar_goles(uuid, bigint, jsonb) from public;
grant execute on function public.guardar_goles(uuid, bigint, jsonb) to anon, authenticated;
