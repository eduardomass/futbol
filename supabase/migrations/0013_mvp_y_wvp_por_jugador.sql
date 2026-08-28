-- =============================================================
-- Proyecto Futbol · MVP y WVP en la tabla de estadísticas
--
-- La migración `0012` dejó el conteo por fecha: `mejores` y `peores` de
-- `plantel_partido`, o sea cuántas planillas pusieron al jugador como su
-- puntaje más alto y como su más bajo. Con eso, cada fecha tiene un jugador
-- del partido y un peor del partido.
--
-- Esto acumula esos títulos en el historial:
--
--   · `mvp`: en cuántas fechas fue el jugador del partido, es decir el que
--            más planillas eligieron como su mejor puntaje.
--   · `wvp`: en cuántas fue el peor del partido.
--
-- **Los dos se comparten en caso de empate**: si en una fecha dos jugadores
-- juntaron 4 «mejores» cada uno, los dos se llevan un MVP de esa fecha. Por
-- eso la suma de la columna puede ser mayor que la cantidad de fechas.
--
-- Se arrastran las dos reglas del conteo de `0012`, que valen por planilla:
-- un empate dentro de una planilla cuenta para todos los empatados, y una
-- planilla plana (el mismo puntaje para los diez) no elige a nadie. Una
-- fecha donde TODAS las planillas son planas no reparte ni MVP ni WVP.
--
-- Cambia el tipo de retorno: drop antes del create y volver a dar el grant.
-- =============================================================

drop function if exists public.estadisticas_jugadores(uuid);

create function public.estadisticas_jugadores(p_token uuid)
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
  promedio_general   numeric,
  mvp                int,
  wvp                int
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
    ),
    -- Desde acá, lo mismo que hace `plantel_partido` pero para todas las
    -- fechas de una: los votos de cada planilla, sus extremos, y cuántas
    -- planillas eligieron a cada jugador como mejor y como peor.
    votos as (
      select pt.partido_id, pt.autor_id, pt.jugador_id, pt.puntaje
      from public.puntajes pt
      join public.partidos p on p.id = pt.partido_id
      where p.estado = 'finalizado'
    ),
    extremos as (
      select v.partido_id, v.autor_id,
             max(v.puntaje) as maximo,
             min(v.puntaje) as minimo
      from votos v
      group by v.partido_id, v.autor_id
      having max(v.puntaje) > min(v.puntaje) -- una planilla plana no elige a nadie
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
    -- Los títulos: llegar al tope de la fecha. Empatar lo comparte, y un
    -- tope en cero no reparte nada.
    titulos as (
      select d.jugador_id as jid,
             (count(*) filter (
               where t.tope_mejores > 0 and d.mejores = t.tope_mejores))::int as mvp,
             (count(*) filter (
               where t.tope_peores > 0 and d.peores = t.tope_peores))::int as wvp
      from destacados d
      join topes t on t.partido_id = d.partido_id
      group by d.jugador_id
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
           pr.promedio,
           coalesce(ti.mvp, 0),
           coalesce(ti.wvp, 0)
    from public.jugadores j
    left join jugados   g  on g.jid = j.id
    left join promedios pr on pr.jid = j.id
    left join titulos   ti on ti.jid = j.id
    where j.activo or g.jid is not null
    order by coalesce(g.ganados, 0) desc, coalesce(g.jugados, 0) desc, j.nombre;
end;
$fn$;

revoke all on function public.estadisticas_jugadores(uuid) from public;
grant execute on function public.estadisticas_jugadores(uuid) to anon, authenticated;
