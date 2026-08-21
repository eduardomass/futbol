-- =============================================================
-- Proyecto Futbol · `mis_partidos` dice si ya voté
--
-- El inicio necesita empujar al jugador a cargar sus puntajes cuando la
-- última fecha que jugó todavía no la votó. `obtener_partido` ya devuelve
-- `ya_puntue`, pero es de a un partido: para saberlo en el listado del
-- inicio hacía falta una llamada por fecha.
--
-- Cambia el tipo de retorno, así que hay que dropear antes del create y
-- volver a dar el grant.
-- =============================================================

drop function if exists public.mis_partidos(uuid);

create function public.mis_partidos(p_token uuid)
returns table (
  id           bigint,
  fecha        date,
  estado       text,
  equipo       text,
  goles_a      integer,
  goles_b      integer,
  resultado    text,
  mi_promedio  numeric,
  ya_puntue    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_jugador bigint;
begin
  v_jugador := public.jugador_de_token(p_token);
  if v_jugador is null then
    if not public.sesion_valida(p_token) then
      raise exception 'Sesión inválida o vencida';
    end if;
    return; -- sesión de admin: no participa de partidos
  end if;

  return query
    select p.id,
           p.fecha,
           p.estado,
           pj.equipo,
           p.goles_a,
           p.goles_b,
           case
             when p.estado <> 'finalizado' then null
             when p.goles_a = p.goles_b then 'empate'
             when (pj.equipo = 'A' and p.goles_a > p.goles_b)
               or (pj.equipo = 'B' and p.goles_b > p.goles_a) then 'ganado'
             else 'perdido'
           end,
           (select round(avg(pt.puntaje), 2) from public.puntajes pt
            where pt.partido_id = p.id and pt.jugador_id = v_jugador),
           exists (select 1 from public.puntajes pt
                   where pt.partido_id = p.id and pt.autor_id = v_jugador)
    from public.partido_jugadores pj
    join public.partidos p on p.id = pj.partido_id
    where pj.jugador_id = v_jugador
    order by p.fecha desc, p.id desc;
end;
$fn$;

revoke all on function public.mis_partidos(uuid) from public;
grant execute on function public.mis_partidos(uuid) to anon, authenticated;
