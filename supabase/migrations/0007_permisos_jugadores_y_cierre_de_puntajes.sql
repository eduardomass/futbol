-- =============================================================
-- Proyecto Futbol · Permisos de jugadores y cierre de puntajes
--
-- Dos pedidos del usuario, los dos con la regla en la base y no solo en
-- la pantalla: cualquiera con un token podía llamar a las funciones.
--
-- 1. Un jugador que no es administrador solo ve y edita SUS datos.
--    · `crear_jugador` y `eliminar_jugador` pasan a ser solo de admin.
--    · `actualizar_jugador` deja editar únicamente la propia fila, y el
--      flag `es_admin` solo lo puede tocar un admin. Sin esto cualquier
--      jugador podía marcarse administrador a sí mismo y quedarse con la
--      grilla de puntajes de todos.
--    · `mi_jugador` es nueva: devuelve la fila propia, para que la
--      pantalla no tenga que traer a los demás para filtrarlos después.
--    `listar_jugadores` queda como estaba: la necesita cualquier jugador
--    para armar el plantel de una fecha.
--
-- 2. Los puntajes de una fecha se cierran cuando ya existe una fecha
--    posterior. Es el equivalente de cerrar la planilla: pasada la fecha
--    siguiente, nadie retoca los puntajes de la anterior.
--    · `guardar_puntajes` (el formulario del jugador) lo rechaza.
--    · La grilla del admin sigue abierta a propósito: es la herramienta
--      para corregir una carga vieja, y ya exige ser administrador.
--    · `obtener_partido` devuelve `puntajes_cerrados` para que la
--      pantalla lo explique en vez de dejar apretar y fallar.
-- =============================================================

-- ============================================================
-- JUGADORES: alta y baja solo de admin
-- ============================================================

create or replace function public.crear_jugador(
  p_token uuid, p_nombre text, p_apellido text, p_apodo text, p_email text, p_clave text,
  p_es_admin boolean default false)
returns bigint
language plpgsql
security definer
set search_path = public
as $fn$
declare v_id bigint;
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede agregar jugadores';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'Nombre y apellido son obligatorios';
  end if;
  if coalesce(trim(p_email), '') = '' or coalesce(p_clave, '') = '' then
    raise exception 'Email y clave son obligatorios';
  end if;

  insert into public.jugadores (nombre, apellido, apodo, email, clave, es_admin)
  values (trim(p_nombre), trim(p_apellido), nullif(trim(p_apodo), ''),
          lower(trim(p_email)), p_clave, coalesce(p_es_admin, false))
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un jugador con el email %', lower(trim(p_email));
end;
$fn$;

create or replace function public.eliminar_jugador(p_token uuid, p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede dar de baja jugadores';
  end if;

  if exists (select 1 from public.partido_jugadores pj where pj.jugador_id = p_id) then
    update public.jugadores set activo = false where id = p_id;
    return 'desactivado';
  end if;

  delete from public.jugadores where id = p_id;
  return 'eliminado';
end;
$fn$;

-- ============================================================
-- JUGADORES: cada uno edita lo suyo
-- ============================================================

create or replace function public.actualizar_jugador(
  p_token uuid, p_id bigint, p_nombre text, p_apellido text, p_apodo text, p_email text,
  p_clave text default null, p_es_admin boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_admin   boolean;
  v_jugador bigint;
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;

  v_admin   := public.sesion_es_admin(p_token);
  v_jugador := public.jugador_de_token(p_token);

  if not v_admin and p_id is distinct from v_jugador then
    raise exception 'Solo podés editar tus propios datos';
  end if;

  update public.jugadores j
  set nombre = trim(p_nombre), apellido = trim(p_apellido),
      apodo = nullif(trim(p_apodo), ''), email = lower(trim(p_email)),
      clave = coalesce(nullif(p_clave, ''), j.clave),
      -- El flag de admin solo lo mueve un admin: si no, se ignora lo que
      -- venga del cliente y queda como estaba.
      es_admin = case when v_admin then coalesce(p_es_admin, j.es_admin) else j.es_admin end
  where j.id = p_id;

  if not found then raise exception 'No existe el jugador %', p_id; end if;
exception
  when unique_violation then
    raise exception 'Ya existe un jugador con el email %', lower(trim(p_email));
end;
$fn$;

-- La fila propia, para la pantalla de un jugador común. Cero filas si el
-- token es de una sesión de la tabla `usuarios` (admin puro, sin jugador).
create or replace function public.mi_jugador(p_token uuid)
returns table (id bigint, nombre text, apellido text, apodo text, email text,
               activo boolean, es_admin boolean)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare v_jugador bigint;
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  v_jugador := public.jugador_de_token(p_token);

  return query
    select j.id, j.nombre, j.apellido, j.apodo, j.email, j.activo, j.es_admin
    from public.jugadores j
    where j.id = v_jugador;
end;
$fn$;

-- ============================================================
-- PUNTAJES: se cierran cuando hay una fecha posterior
-- ============================================================

create or replace function public.guardar_puntajes(
  p_token      uuid,
  p_partido_id bigint,
  p_puntajes   jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_autor    bigint;
  v_estado   text;
  v_fecha    date;
  v_esperado int;
  v_recibido int;
begin
  v_autor := public.jugador_de_token(p_token);
  if v_autor is null then
    raise exception 'Tenés que entrar como jugador para puntuar';
  end if;

  select estado, fecha into v_estado, v_fecha from public.partidos where id = p_partido_id;
  if v_estado is null then
    raise exception 'No existe el partido %', p_partido_id;
  end if;
  if v_estado <> 'finalizado' then
    raise exception 'Los puntajes se cargan recién cuando el partido está finalizado';
  end if;

  if exists (select 1 from public.partidos p2 where p2.fecha > v_fecha) then
    raise exception 'Los puntajes de esta fecha ya están cerrados: hay fechas posteriores cargadas';
  end if;

  if not exists (
    select 1 from public.partido_jugadores
    where partido_id = p_partido_id and jugador_id = v_autor
  ) then
    raise exception 'Solo pueden puntuar los jugadores que participaron del partido';
  end if;

  select count(*)::int into v_esperado
  from public.partido_jugadores where partido_id = p_partido_id;

  select count(distinct (e ->> 'jugador_id')::bigint)::int into v_recibido
  from jsonb_array_elements(p_puntajes) e
  where (e ->> 'jugador_id')::bigint in (
    select jugador_id from public.partido_jugadores where partido_id = p_partido_id
  );

  if v_recibido <> v_esperado then
    raise exception 'Hay que puntuar a los % jugadores del partido (llegaron %)', v_esperado, v_recibido;
  end if;

  insert into public.puntajes (partido_id, autor_id, jugador_id, puntaje)
  select p_partido_id,
         v_autor,
         (e ->> 'jugador_id')::bigint,
         (e ->> 'puntaje')::numeric
  from jsonb_array_elements(p_puntajes) e
  on conflict (partido_id, autor_id, jugador_id)
    do update set puntaje = excluded.puntaje;

  return v_recibido;
end;
$fn$;

-- ============================================================
-- DETALLE DEL PARTIDO: suma `puntajes_cerrados`
--
-- Cambia el tipo de retorno, así que hay que dropear antes del create y
-- volver a dar el grant.
-- ============================================================

drop function if exists public.obtener_partido(uuid, bigint);

create function public.obtener_partido(p_token uuid, p_partido_id bigint)
returns table (
  id                bigint,
  fecha             date,
  estado            text,
  goles_a           integer,
  goles_b           integer,
  promedio_fecha    numeric,
  soy_participante  boolean,
  ya_puntue         boolean,
  puntajes_cerrados boolean
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_jugador bigint;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;
  v_jugador := public.jugador_de_token(p_token);

  return query
    select p.id,
           p.fecha,
           p.estado,
           p.goles_a,
           p.goles_b,
           (select round(avg(pt.puntaje), 2) from public.puntajes pt where pt.partido_id = p.id),
           exists (select 1 from public.partido_jugadores pj
                   where pj.partido_id = p.id and pj.jugador_id = v_jugador),
           exists (select 1 from public.puntajes pt
                   where pt.partido_id = p.id and pt.autor_id = v_jugador),
           exists (select 1 from public.partidos p2 where p2.fecha > p.fecha)
    from public.partidos p
    where p.id = p_partido_id;
end;
$fn$;

revoke all on function public.obtener_partido(uuid, bigint) from public;
grant execute on function public.obtener_partido(uuid, bigint) to anon, authenticated;

revoke all on function public.mi_jugador(uuid) from public;
grant execute on function public.mi_jugador(uuid) to anon, authenticated;
