-- =============================================================
-- Proyecto Futbol · Los goles por jugador actualizan el resultado
--
-- Hasta la migración 0010 los goles individuales y el marcador de la fecha
-- eran dos datos independientes: `guardar_goles` no tocaba
-- `partidos.goles_a` / `goles_b`, y la pantalla solo avisaba cuando no
-- cerraban. El usuario pidió lo contrario: cargar los goles de cada uno es
-- la forma de cargar el resultado.
--
-- Ahora `guardar_goles` recalcula el marcador con la suma de cada equipo,
-- sobre TODO el plantel (no solo sobre los jugadores que llegaron en el
-- array, que pueden ser una carga parcial).
--
-- La excepción: si el partido entero suma cero goles, el resultado queda
-- como estaba. Un plantel todo en cero no es un 0-0, es «todavía no lo
-- cargué» — y si el 0-0 fue real, se carga con `cargar_resultado`.
--
-- Consecuencia a tener en cuenta: ya no hay lugar para un gol en contra.
-- El marcador es la suma de los goleadores. Si alguna vez hace falta uno,
-- la salida es `cargar_resultado` después de guardar los goles.
-- =============================================================

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
  v_suma_a     int;
  v_suma_b     int;
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

  -- El marcador sale de la suma del plantel completo, no solo de lo que
  -- llegó en esta carga.
  select coalesce(sum(pj.goles) filter (where pj.equipo = 'A'), 0)::int,
         coalesce(sum(pj.goles) filter (where pj.equipo = 'B'), 0)::int
    into v_suma_a, v_suma_b
  from public.partido_jugadores pj
  where pj.partido_id = p_partido_id;

  -- Todo en cero es «no cargué nada», no un 0-0: el resultado no se toca.
  if v_suma_a + v_suma_b > 0 then
    update public.partidos
    set goles_a = v_suma_a,
        goles_b = v_suma_b
    where id = p_partido_id;
  end if;

  return v_filas;
end;
$fn$;

revoke all on function public.guardar_goles(uuid, bigint, jsonb) from public;
grant execute on function public.guardar_goles(uuid, bigint, jsonb) to anon, authenticated;
