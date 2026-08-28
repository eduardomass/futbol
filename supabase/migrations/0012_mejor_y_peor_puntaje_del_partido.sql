-- =============================================================
-- Proyecto Futbol · Mejor y peor puntaje de cada planilla
--
-- Además del promedio, cada jugador ahora trae dos números de la fecha:
--
--   · `mejores`: cuántas planillas lo pusieron como su puntaje MÁS ALTO.
--   · `peores`:  cuántas lo pusieron como su puntaje MÁS BAJO.
--
-- El que más `mejores` junta es el jugador del partido; el que más `peores`,
-- el peor. Ese cálculo lo hace la pantalla, que ya tiene el plantel entero.
--
-- Dos reglas del conteo:
--
--   1. Un empate dentro de una planilla cuenta para todos los empatados. Si
--      un autor puso 8 como máximo y se lo dio a tres jugadores, los tres se
--      llevan un `mejores`.
--   2. Una planilla PLANA no elige a nadie. Si un autor puntuó igual a los
--      diez, su máximo es también su mínimo: no está diciendo quién fue el
--      mejor ni el peor, así que no cuenta (`having max > min`). Sin esa
--      regla, los diez jugadores se llevarían un `mejores` y un `peores` de
--      esa planilla y el resultado sería ruido.
--
-- Las celdas vacías siguen sin existir como fila, así que una planilla
-- incompleta se mide contra los puntajes que sí tiene.
--
-- Cambia el tipo de retorno de `plantel_partido`: drop antes del create y
-- volver a dar el grant. De paso, el promedio y la cantidad de votos pasan a
-- salir de la misma CTE que los destacados en vez de dos subconsultas
-- correlacionadas.
-- =============================================================

drop function if exists public.plantel_partido(uuid, bigint);

create function public.plantel_partido(p_token uuid, p_partido_id bigint)
returns table (jugador_id bigint, nombre text, apellido text, apodo text, equipo text,
               promedio numeric, votos integer, goles integer,
               mejores integer, peores integer)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;

  return query
    with votos as (
      select pt.autor_id, pt.jugador_id, pt.puntaje
      from public.puntajes pt
      where pt.partido_id = p_partido_id
    ),
    -- Los extremos de cada planilla. El `having` deja afuera al autor que
    -- puntuó igual a todos: su voto no elige mejor ni peor a nadie.
    extremos as (
      select v.autor_id, max(v.puntaje) as maximo, min(v.puntaje) as minimo
      from votos v
      group by v.autor_id
      having max(v.puntaje) > min(v.puntaje)
    ),
    destacados as (
      select v.jugador_id,
             (count(*) filter (where v.puntaje = e.maximo))::int as mejores,
             (count(*) filter (where v.puntaje = e.minimo))::int as peores
      from votos v
      join extremos e on e.autor_id = v.autor_id
      group by v.jugador_id
    ),
    recibidos as (
      select v.jugador_id,
             round(avg(v.puntaje), 2) as promedio,
             count(*)::int as votos
      from votos v
      group by v.jugador_id
    )
    select j.id, j.nombre, j.apellido, j.apodo, pj.equipo,
           r.promedio,
           coalesce(r.votos, 0),
           pj.goles,
           coalesce(d.mejores, 0),
           coalesce(d.peores, 0)
    from public.partido_jugadores pj
    join public.jugadores j on j.id = pj.jugador_id
    left join recibidos  r on r.jugador_id = j.id
    left join destacados d on d.jugador_id = j.id
    where pj.partido_id = p_partido_id
    order by pj.equipo, j.nombre, j.apellido;
end;
$fn$;

revoke all on function public.plantel_partido(uuid, bigint) from public;
grant execute on function public.plantel_partido(uuid, bigint) to anon, authenticated;
