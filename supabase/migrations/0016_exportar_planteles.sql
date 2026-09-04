-- =============================================================
-- Proyecto Futbol · Exportar los planteles de varias fechas de una
--
-- La pantalla de partidos gana un botón para exportar a Excel cómo fueron
-- los equipos en cada fecha. Para eso hace falta el plantel de MUCHAS fechas
-- juntas, y `plantel_partido` devuelve una sola: exportar 40 fechas serían 40
-- llamadas RPC desde el navegador.
--
-- `exportar_planteles` es la misma consulta pero para un conjunto de fechas.
-- Devuelve una fila por (fecha, jugador) con todo lo que necesita el Excel:
-- la fecha y su estado, el marcador, el equipo, los goles del jugador, su
-- promedio y votos de esa fecha, los `mejores` / `peores` de la planilla, y
-- dos cosas ya masticadas para no recalcularlas en el cliente:
--
--   · `resultado`: ganado / empate / perdido desde el equipo del jugador.
--     Null si la fecha no está finalizada o no tiene marcador.
--   · `es_mvp` / `es_wvp`: si fue el jugador o el peor del partido de esa
--     fecha. Mismo criterio que `estadisticas_jugadores` (migración `0013`):
--     llegar al tope de la fecha, empates compartidos, y un tope en cero no
--     reparte título.
--
-- `p_partido_ids` en null o vacío significa TODAS las fechas, que es lo que
-- pide el «seleccionar todo» de la pantalla sin tener que mandar la lista.
--
-- Pide solo sesión válida, como `plantel_partido`: el plantel y los promedios
-- de una fecha ya los ve cualquier jugador en la pantalla de la fecha. Lo que
-- no sale de acá es la planilla autor × jugador, que sigue siendo del admin
-- (`matriz_puntajes`).
-- =============================================================

create or replace function public.exportar_planteles(
  p_token       uuid,
  p_partido_ids bigint[] default null
)
returns table (
  partido_id     bigint,
  fecha          date,
  estado         text,
  goles_a        integer,
  goles_b        integer,
  promedio_fecha numeric,
  jugador_id     bigint,
  nombre         text,
  apellido       text,
  apodo          text,
  equipo         text,
  goles          integer,
  promedio       numeric,
  votos          integer,
  mejores        integer,
  peores         integer,
  resultado      text,
  es_mvp         boolean,
  es_wvp         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  return query
    with elegidos as (
      select p.id, p.fecha, p.estado, p.goles_a, p.goles_b
      from public.partidos p
      where p_partido_ids is null
         or cardinality(p_partido_ids) = 0
         or p.id = any (p_partido_ids)
    ),
    votos as (
      select pt.partido_id, pt.autor_id, pt.jugador_id, pt.puntaje
      from public.puntajes pt
      join elegidos e on e.id = pt.partido_id
    ),
    -- Los extremos de cada planilla. El `having` deja afuera al autor que
    -- puntuó igual a todos: su voto no elige mejor ni peor a nadie.
    extremos as (
      select v.partido_id, v.autor_id,
             max(v.puntaje) as maximo,
             min(v.puntaje) as minimo
      from votos v
      group by v.partido_id, v.autor_id
      having max(v.puntaje) > min(v.puntaje)
    ),
    destacados as (
      select v.partido_id,
             v.jugador_id,
             (count(*) filter (where v.puntaje = e.maximo))::int as mejores,
             (count(*) filter (where v.puntaje = e.minimo))::int as peores
      from votos v
      join extremos e on e.partido_id = v.partido_id and e.autor_id = v.autor_id
      group by v.partido_id, v.jugador_id
    ),
    -- El tope de cada fecha: cuántas planillas juntó el más elegido.
    topes as (
      select d.partido_id,
             max(d.mejores) as tope_mejores,
             max(d.peores)  as tope_peores
      from destacados d
      group by d.partido_id
    ),
    recibidos as (
      select v.partido_id,
             v.jugador_id,
             round(avg(v.puntaje), 2) as promedio,
             count(*)::int as votos
      from votos v
      group by v.partido_id, v.jugador_id
    ),
    promedios_fecha as (
      select v.partido_id, round(avg(v.puntaje), 2) as promedio
      from votos v
      group by v.partido_id
    )
    select e.id,
           e.fecha,
           e.estado,
           e.goles_a,
           e.goles_b,
           pf.promedio,
           j.id,
           j.nombre,
           j.apellido,
           j.apodo,
           pj.equipo,
           pj.goles,
           r.promedio,
           coalesce(r.votos, 0),
           coalesce(d.mejores, 0),
           coalesce(d.peores, 0),
           case
             when e.estado <> 'finalizado' or e.goles_a is null or e.goles_b is null then null
             when e.goles_a = e.goles_b then 'empate'
             when (pj.equipo = 'A') = (e.goles_a > e.goles_b) then 'ganado'
             else 'perdido'
           end,
           coalesce(t.tope_mejores > 0 and d.mejores = t.tope_mejores, false),
           coalesce(t.tope_peores  > 0 and d.peores  = t.tope_peores,  false)
    from elegidos e
    join public.partido_jugadores pj on pj.partido_id = e.id
    join public.jugadores j          on j.id = pj.jugador_id
    left join promedios_fecha pf on pf.partido_id = e.id
    left join recibidos      r  on r.partido_id = e.id and r.jugador_id = j.id
    left join destacados     d  on d.partido_id = e.id and d.jugador_id = j.id
    left join topes          t  on t.partido_id = e.id
    order by e.fecha desc, pj.equipo, j.nombre;
end;
$fn$;

revoke all on function public.exportar_planteles(uuid, bigint[]) from public;
grant execute on function public.exportar_planteles(uuid, bigint[]) to anon, authenticated;
