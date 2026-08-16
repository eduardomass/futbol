-- =============================================================
-- Proyecto Futbol · Administradores y grilla de puntajes
--
-- 1. Un jugador puede además ser administrador (`jugadores.es_admin`).
--    Hasta acá "admin" era solo una sesión de la tabla `usuarios`, pero
--    `iniciar_sesion` valida contra `jugadores` primero, así que quien
--    estaba en las dos tablas nunca conseguía una sesión de admin.
-- 2. Grilla de puntajes: matriz autor × jugador para que el admin pueda
--    cargar los votos de todos, como una planilla.
-- 3. Los listados de jugadores pasan a ordenarse por nombre.
-- =============================================================

alter table public.jugadores add column if not exists es_admin boolean not null default false;

update public.jugadores set es_admin = true where lower(email) = 'eduardomass@gmail.com';

-- ============================================================
-- SESIÓN
-- ============================================================

create or replace function public.sesion_es_admin(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $fn$
  select exists (
    select 1
    from public.sesiones s
    left join public.jugadores j on j.id = s.jugador_id
    where s.token = p_token
      and s.expira_en > now()
      and (s.usuario_id is not null or coalesce(j.es_admin, false))
  );
$fn$;

-- Ahora el flag es_admin sale del jugador, no solo de la tabla usuarios.
create or replace function public.iniciar_sesion(p_email text, p_clave text)
returns table (token uuid, jugador_id bigint, nombre text, es_admin boolean)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_jugador public.jugadores%rowtype;
  v_usuario public.usuarios%rowtype;
  v_token   uuid := gen_random_uuid();
begin
  select * into v_jugador from public.jugadores j
  where lower(j.email) = lower(trim(p_email)) and j.clave = p_clave and j.activo;

  if found then
    insert into public.sesiones (token, jugador_id) values (v_token, v_jugador.id);
    return query select v_token, v_jugador.id,
      coalesce(nullif(trim(v_jugador.apodo), ''), v_jugador.nombre), v_jugador.es_admin;
    return;
  end if;

  select * into v_usuario from public.usuarios u
  where lower(u.email) = lower(trim(p_email)) and u.password = p_clave;

  if found then
    insert into public.sesiones (token, usuario_id) values (v_token, v_usuario.id);
    return query select v_token, null::bigint, split_part(v_usuario.email, '@', 1), true;
    return;
  end if;

  return;
end;
$fn$;

-- ============================================================
-- JUGADORES: se agrega es_admin y se ordena por nombre
-- ============================================================

drop function if exists public.listar_jugadores(uuid, boolean);

create function public.listar_jugadores(p_token uuid, p_incluir_inactivos boolean default false)
returns table (id bigint, nombre text, apellido text, apodo text, email text,
               activo boolean, es_admin boolean)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;
  return query
    select j.id, j.nombre, j.apellido, j.apodo, j.email, j.activo, j.es_admin
    from public.jugadores j
    where p_incluir_inactivos or j.activo
    order by j.nombre, j.apellido;
end;
$fn$;

drop function if exists public.crear_jugador(uuid, text, text, text, text, text);

create function public.crear_jugador(
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

drop function if exists public.actualizar_jugador(uuid, bigint, text, text, text, text, text);

create function public.actualizar_jugador(
  p_token uuid, p_id bigint, p_nombre text, p_apellido text, p_apodo text, p_email text,
  p_clave text default null, p_es_admin boolean default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_valida(p_token) then raise exception 'Sesión inválida o vencida'; end if;

  update public.jugadores j
  set nombre = trim(p_nombre), apellido = trim(p_apellido),
      apodo = nullif(trim(p_apodo), ''), email = lower(trim(p_email)),
      clave = coalesce(nullif(p_clave, ''), j.clave),
      es_admin = coalesce(p_es_admin, j.es_admin)
  where j.id = p_id;

  if not found then raise exception 'No existe el jugador %', p_id; end if;
exception
  when unique_violation then
    raise exception 'Ya existe un jugador con el email %', lower(trim(p_email));
end;
$fn$;

-- ============================================================
-- PLANTEL: ordenado por nombre
-- ============================================================

create or replace function public.plantel_partido(p_token uuid, p_partido_id bigint)
returns table (jugador_id bigint, nombre text, apellido text, apodo text, equipo text,
               promedio numeric, votos integer)
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
            where pt.partido_id = p_partido_id and pt.jugador_id = j.id)
    from public.partido_jugadores pj
    join public.jugadores j on j.id = pj.jugador_id
    where pj.partido_id = p_partido_id
    order by pj.equipo, j.nombre, j.apellido;
end;
$fn$;

-- ============================================================
-- GRILLA DE PUNTAJES (solo administradores)
-- ============================================================

-- Devuelve todos los votos del partido: quién puntuó a quién y con cuánto.
-- Es información sensible entre jugadores, por eso queda restringida al admin.
create or replace function public.matriz_puntajes(p_token uuid, p_partido_id bigint)
returns table (autor_id bigint, jugador_id bigint, puntaje numeric)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede ver la grilla completa de puntajes';
  end if;

  return query
    select pt.autor_id, pt.jugador_id, pt.puntaje
    from public.puntajes pt
    where pt.partido_id = p_partido_id;
end;
$fn$;

-- p_celdas: [{"autor_id": 1, "jugador_id": 2, "puntaje": 7.5}, ...]
-- `puntaje` en null borra esa celda. Acepta cargas parciales: el admin
-- va completando la planilla de a poco.
create or replace function public.guardar_grilla_puntajes(
  p_token uuid, p_partido_id bigint, p_celdas jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_estado    text;
  v_invalidas int;
  v_afectadas int := 0;
begin
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede editar la grilla de puntajes';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado <> 'finalizado' then
    raise exception 'La grilla se edita recién cuando el partido está finalizado';
  end if;

  -- Autor y puntuado tienen que ser jugadores de este partido.
  select count(*)::int into v_invalidas
  from jsonb_array_elements(p_celdas) e
  where (e ->> 'autor_id')::bigint not in (
          select jugador_id from public.partido_jugadores where partido_id = p_partido_id)
     or (e ->> 'jugador_id')::bigint not in (
          select jugador_id from public.partido_jugadores where partido_id = p_partido_id);

  if v_invalidas > 0 then
    raise exception 'Hay % celdas que apuntan a jugadores que no son de este partido', v_invalidas;
  end if;

  delete from public.puntajes pt
  where pt.partido_id = p_partido_id
    and exists (
      select 1 from jsonb_array_elements(p_celdas) e
      where (e ->> 'autor_id')::bigint = pt.autor_id
        and (e ->> 'jugador_id')::bigint = pt.jugador_id
        and e ->> 'puntaje' is null);

  insert into public.puntajes (partido_id, autor_id, jugador_id, puntaje)
  select p_partido_id,
         (e ->> 'autor_id')::bigint,
         (e ->> 'jugador_id')::bigint,
         (e ->> 'puntaje')::numeric
  from jsonb_array_elements(p_celdas) e
  where e ->> 'puntaje' is not null
  on conflict (partido_id, autor_id, jugador_id) do update set puntaje = excluded.puntaje;

  get diagnostics v_afectadas = row_count;
  return v_afectadas;
end;
$fn$;

-- ============================================================
-- PERMISOS
-- ============================================================

do $blk$
declare f text;
begin
  foreach f in array array[
    'sesion_es_admin(uuid)',
    'iniciar_sesion(text, text)',
    'listar_jugadores(uuid, boolean)',
    'crear_jugador(uuid, text, text, text, text, text, boolean)',
    'actualizar_jugador(uuid, bigint, text, text, text, text, text, boolean)',
    'plantel_partido(uuid, bigint)',
    'matriz_puntajes(uuid, bigint)',
    'guardar_grilla_puntajes(uuid, bigint, jsonb)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end;
$blk$;
