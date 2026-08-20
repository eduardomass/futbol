-- =============================================================
-- Proyecto Futbol · Estadísticas por jugador
--
-- `estadisticas(p_token)` devuelve solo los números del jugador de la
-- sesión, y una sesión de admin puro ve todo en cero. Faltaba la tabla
-- del grupo: cada jugador con cuántas fechas jugó, ganó, empató y perdió.
--
-- Reglas del conteo:
--   · Solo entran partidos `finalizado` con resultado cargado. Un partido
--     programado o en curso no cuenta para nadie.
--   · Aparecen todos los jugadores activos, más los inactivos que tengan
--     historial: la baja lógica no borra las fechas que jugaron.
--   · `promedio_general` es `avg(puntaje)` sobre los votos que recibió el
--     jugador en toda su historia — igual criterio que `estadisticas`.
--     Una celda vacía de la grilla no existe como fila, así que no cuenta
--     como cero ni infla el divisor.
--
-- La ve cualquier sesión válida, no solo el admin: son los números del
-- grupo, no votos individuales.
-- =============================================================

create or replace function public.estadisticas_jugadores(p_token uuid)
returns table (
  jugador_id         bigint,
  nombre             text,
  apellido           text,
  apodo              text,
  activo             boolean,
  partidos_jugados   int,
  partidos_ganados   int,
  partidos_empatados int,
  partidos_perdidos  int,
  promedio_general   numeric
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
    with jugados as (
      select pj.jugador_id as jid,
             count(*)::int as jugados,
             (count(*) filter (
               where (pj.equipo = 'A' and p.goles_a > p.goles_b)
                  or (pj.equipo = 'B' and p.goles_b > p.goles_a)))::int as ganados,
             (count(*) filter (where p.goles_a = p.goles_b))::int as empatados,
             (count(*) filter (
               where (pj.equipo = 'A' and p.goles_a < p.goles_b)
                  or (pj.equipo = 'B' and p.goles_b < p.goles_a)))::int as perdidos
      from public.partido_jugadores pj
      join public.partidos p on p.id = pj.partido_id
      where p.estado = 'finalizado'
        and p.goles_a is not null
        and p.goles_b is not null
      group by pj.jugador_id
    ),
    promedios as (
      select pt.jugador_id as jid, round(avg(pt.puntaje), 2) as promedio
      from public.puntajes pt
      group by pt.jugador_id
    )
    select j.id,
           j.nombre,
           j.apellido,
           j.apodo,
           j.activo,
           coalesce(g.jugados, 0),
           coalesce(g.ganados, 0),
           coalesce(g.empatados, 0),
           coalesce(g.perdidos, 0),
           pr.promedio
    from public.jugadores j
    left join jugados   g  on g.jid = j.id
    left join promedios pr on pr.jid = j.id
    where j.activo or g.jid is not null
    order by coalesce(g.ganados, 0) desc, coalesce(g.jugados, 0) desc, j.nombre;
end;
$fn$;

revoke all on function public.estadisticas_jugadores(uuid) from public;
grant execute on function public.estadisticas_jugadores(uuid) to anon, authenticated;
