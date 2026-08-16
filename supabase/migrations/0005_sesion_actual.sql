-- =============================================================
-- Proyecto Futbol · Refrescar la sesión guardada
--
-- El frontend guarda la sesión en localStorage al iniciar sesión y no la
-- volvía a consultar nunca. Eso dejaba datos viejos pegados: cuando a un
-- jugador se lo marcaba como administrador, su navegador seguía creyendo
-- que no lo era hasta que cerrara sesión a mano. Lo mismo con el nombre,
-- o con un token ya vencido, que solo se descubría al fallar una llamada.
--
-- `sesion_actual` deja preguntar por el estado real del token. Devuelve
-- cero filas si no sirve, y el frontend lo usa para limpiar y mandar al
-- login.
-- =============================================================

create or replace function public.sesion_actual(p_token uuid)
returns table (jugador_id bigint, nombre text, es_admin boolean)
language sql
stable
security definer
set search_path = public
as $fn$
  select s.jugador_id,
         coalesce(
           nullif(trim(j.apodo), ''),
           j.nombre,
           split_part(u.email, '@', 1)
         ),
         (s.usuario_id is not null or coalesce(j.es_admin, false))
  from public.sesiones s
  left join public.jugadores j on j.id = s.jugador_id
  left join public.usuarios  u on u.id = s.usuario_id
  where s.token = p_token
    and s.expira_en > now();
$fn$;

revoke all on function public.sesion_actual(uuid) from public;
grant execute on function public.sesion_actual(uuid) to anon, authenticated;
