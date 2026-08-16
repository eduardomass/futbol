-- =============================================================
-- Proyecto Futbol · Jugadores, Partidos y Puntajes
--
-- Modelo: cada partido son 10 jugadores, 5 por equipo (A y B).
-- Ciclo de vida del partido: programado → en_curso → finalizado.
-- Al finalizar, cada jugador que participó puntúa a los 10 (incluido él).
--
-- Todas las tablas tienen RLS activo y SIN policies: el acceso pasa
-- exclusivamente por funciones SECURITY DEFINER que validan un token
-- de sesión. Ver `sesiones` más abajo.
-- =============================================================

-- ============================================================
-- TABLAS
-- ============================================================

create table if not exists public.jugadores (
  id         bigint generated always as identity primary key,
  nombre     text not null,
  apellido   text not null,
  apodo      text,
  email      text not null unique,
  clave      text not null,
  activo     boolean not null default true,
  created_at timestamptz not null default now()
);

-- Sesiones: al iniciar sesión se genera un token opaco que el frontend
-- guarda y manda en cada llamada. Evita tener que pasear el password.
create table if not exists public.sesiones (
  token      uuid primary key default gen_random_uuid(),
  jugador_id bigint references public.jugadores(id) on delete cascade,
  usuario_id bigint references public.usuarios(id) on delete cascade,
  creada_en  timestamptz not null default now(),
  expira_en  timestamptz not null default now() + interval '30 days',
  constraint sesion_tiene_dueno check (jugador_id is not null or usuario_id is not null)
);

create index if not exists sesiones_expira_en_idx on public.sesiones (expira_en);

create table if not exists public.partidos (
  id         bigint generated always as identity primary key,
  fecha      date not null,
  estado     text not null default 'programado'
             check (estado in ('programado', 'en_curso', 'finalizado')),
  goles_a    integer check (goles_a >= 0),
  goles_b    integer check (goles_b >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.partido_jugadores (
  id         bigint generated always as identity primary key,
  partido_id bigint not null references public.partidos(id) on delete cascade,
  jugador_id bigint not null references public.jugadores(id) on delete restrict,
  equipo     text not null check (equipo in ('A', 'B')),
  created_at timestamptz not null default now(),
  unique (partido_id, jugador_id)
);

create index if not exists partido_jugadores_partido_idx on public.partido_jugadores (partido_id);
create index if not exists partido_jugadores_jugador_idx on public.partido_jugadores (jugador_id);

-- Un voto por (partido, autor, jugador puntuado). El autor se puntúa a sí mismo también.
create table if not exists public.puntajes (
  id         bigint generated always as identity primary key,
  partido_id bigint not null references public.partidos(id) on delete cascade,
  autor_id   bigint not null references public.jugadores(id) on delete cascade,
  jugador_id bigint not null references public.jugadores(id) on delete cascade,
  puntaje    numeric(3, 1) not null
             check (puntaje >= 1 and puntaje <= 10 and (puntaje * 2) = trunc(puntaje * 2)),
  created_at timestamptz not null default now(),
  unique (partido_id, autor_id, jugador_id)
);

create index if not exists puntajes_partido_jugador_idx on public.puntajes (partido_id, jugador_id);

alter table public.jugadores         enable row level security;
alter table public.sesiones          enable row level security;
alter table public.partidos          enable row level security;
alter table public.partido_jugadores enable row level security;
alter table public.puntajes          enable row level security;

-- ============================================================
-- SESIÓN
-- ============================================================

-- Devuelve el jugador dueño del token, o null si el token no sirve
-- o si la sesión es de un usuario administrador (que no es jugador).
create or replace function public.jugador_de_token(p_token uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select s.jugador_id
  from public.sesiones s
  where s.token = p_token
    and s.expira_en > now();
$$;

create or replace function public.sesion_valida(p_token uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.sesiones s
    where s.token = p_token and s.expira_en > now()
  );
$$;

-- Valida contra jugadores primero y contra usuarios (admin) después.
create or replace function public.iniciar_sesion(p_email text, p_clave text)
returns table (token uuid, jugador_id bigint, nombre text, es_admin boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_jugador public.jugadores%rowtype;
  v_usuario public.usuarios%rowtype;
  v_token   uuid := gen_random_uuid();
begin
  select * into v_jugador
  from public.jugadores j
  where lower(j.email) = lower(trim(p_email))
    and j.clave = p_clave
    and j.activo;

  if found then
    insert into public.sesiones (token, jugador_id) values (v_token, v_jugador.id);
    return query
      select v_token,
             v_jugador.id,
             coalesce(nullif(trim(v_jugador.apodo), ''), v_jugador.nombre),
             false;
    return;
  end if;

  select * into v_usuario
  from public.usuarios u
  where lower(u.email) = lower(trim(p_email))
    and u.password = p_clave;

  if found then
    insert into public.sesiones (token, usuario_id) values (v_token, v_usuario.id);
    return query
      select v_token,
             null::bigint,
             split_part(v_usuario.email, '@', 1),
             true;
    return;
  end if;

  return; -- credenciales inválidas: cero filas
end;
$$;

create or replace function public.cerrar_sesion(p_token uuid)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.sesiones where token = p_token;
$$;

-- ============================================================
-- ABM DE JUGADORES
-- ============================================================

create or replace function public.listar_jugadores(p_token uuid, p_incluir_inactivos boolean default false)
returns table (id bigint, nombre text, apellido text, apodo text, email text, activo boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  return query
    select j.id, j.nombre, j.apellido, j.apodo, j.email, j.activo
    from public.jugadores j
    where p_incluir_inactivos or j.activo
    order by j.apellido, j.nombre;
end;
$$;

create or replace function public.crear_jugador(
  p_token    uuid,
  p_nombre   text,
  p_apellido text,
  p_apodo    text,
  p_email    text,
  p_clave    text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;
  if coalesce(trim(p_nombre), '') = '' or coalesce(trim(p_apellido), '') = '' then
    raise exception 'Nombre y apellido son obligatorios';
  end if;
  if coalesce(trim(p_email), '') = '' or coalesce(p_clave, '') = '' then
    raise exception 'Email y clave son obligatorios';
  end if;

  insert into public.jugadores (nombre, apellido, apodo, email, clave)
  values (trim(p_nombre), trim(p_apellido), nullif(trim(p_apodo), ''), lower(trim(p_email)), p_clave)
  returning id into v_id;

  return v_id;
exception
  when unique_violation then
    raise exception 'Ya existe un jugador con el email %', lower(trim(p_email));
end;
$$;

-- p_clave en null deja la clave sin cambios.
create or replace function public.actualizar_jugador(
  p_token    uuid,
  p_id       bigint,
  p_nombre   text,
  p_apellido text,
  p_apodo    text,
  p_email    text,
  p_clave    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  update public.jugadores j
  set nombre   = trim(p_nombre),
      apellido = trim(p_apellido),
      apodo    = nullif(trim(p_apodo), ''),
      email    = lower(trim(p_email)),
      clave    = coalesce(nullif(p_clave, ''), j.clave)
  where j.id = p_id;

  if not found then
    raise exception 'No existe el jugador %', p_id;
  end if;
exception
  when unique_violation then
    raise exception 'Ya existe un jugador con el email %', lower(trim(p_email));
end;
$$;

-- Si el jugador ya participó de algún partido no se borra: se desactiva,
-- para no perder el historial de puntajes y resultados.
create or replace function public.eliminar_jugador(p_token uuid, p_id bigint)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  if exists (select 1 from public.partido_jugadores pj where pj.jugador_id = p_id) then
    update public.jugadores set activo = false where id = p_id;
    return 'desactivado';
  end if;

  delete from public.jugadores where id = p_id;
  return 'eliminado';
end;
$$;

-- ============================================================
-- PARTIDOS
-- ============================================================

-- Si hoy es jueves devuelve hoy; si no, el jueves siguiente.
create or replace function public.proximo_jueves()
returns date
language plpgsql
stable
as $$
declare
  v_dias int;
begin
  v_dias := (4 - extract(isodow from current_date)::int + 7) % 7;
  return current_date + v_dias;
end;
$$;

create or replace function public.crear_partido(p_token uuid, p_fecha date default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  insert into public.partidos (fecha)
  values (coalesce(p_fecha, public.proximo_jueves()))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.listar_partidos(p_token uuid)
returns table (
  id         bigint,
  fecha      date,
  estado     text,
  goles_a    integer,
  goles_b    integer,
  jugadores  integer,
  promedio   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  return query
    select p.id,
           p.fecha,
           p.estado,
           p.goles_a,
           p.goles_b,
           (select count(*)::int from public.partido_jugadores pj where pj.partido_id = p.id),
           (select round(avg(pt.puntaje), 2) from public.puntajes pt where pt.partido_id = p.id)
    from public.partidos p
    order by p.fecha desc, p.id desc;
end;
$$;

create or replace function public.obtener_partido(p_token uuid, p_partido_id bigint)
returns table (
  id                bigint,
  fecha             date,
  estado            text,
  goles_a           integer,
  goles_b           integer,
  promedio_fecha    numeric,
  soy_participante  boolean,
  ya_puntue         boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
                   where pt.partido_id = p.id and pt.autor_id = v_jugador)
    from public.partidos p
    where p.id = p_partido_id;
end;
$$;

create or replace function public.plantel_partido(p_token uuid, p_partido_id bigint)
returns table (
  jugador_id bigint,
  nombre     text,
  apellido   text,
  apodo      text,
  equipo     text,
  promedio   numeric,
  votos      integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  return query
    select j.id,
           j.nombre,
           j.apellido,
           j.apodo,
           pj.equipo,
           (select round(avg(pt.puntaje), 2) from public.puntajes pt
            where pt.partido_id = p_partido_id and pt.jugador_id = j.id),
           (select count(*)::int from public.puntajes pt
            where pt.partido_id = p_partido_id and pt.jugador_id = j.id)
    from public.partido_jugadores pj
    join public.jugadores j on j.id = pj.jugador_id
    where pj.partido_id = p_partido_id
    order by pj.equipo, j.apellido, j.nombre;
end;
$$;

create or replace function public.agregar_jugador_partido(
  p_token      uuid,
  p_partido_id bigint,
  p_jugador_id bigint,
  p_equipo     text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_en_equipo int;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado is null then
    raise exception 'No existe el partido %', p_partido_id;
  end if;
  if v_estado <> 'programado' then
    raise exception 'El partido ya comenzó: no se puede cambiar el plantel';
  end if;
  if p_equipo not in ('A', 'B') then
    raise exception 'Equipo inválido: %', p_equipo;
  end if;

  select count(*)::int into v_en_equipo
  from public.partido_jugadores
  where partido_id = p_partido_id and equipo = p_equipo;

  if v_en_equipo >= 5 then
    raise exception 'El equipo % ya tiene 5 jugadores', p_equipo;
  end if;

  insert into public.partido_jugadores (partido_id, jugador_id, equipo)
  values (p_partido_id, p_jugador_id, p_equipo);
exception
  when unique_violation then
    raise exception 'Ese jugador ya está en el partido';
end;
$$;

create or replace function public.quitar_jugador_partido(
  p_token      uuid,
  p_partido_id bigint,
  p_jugador_id bigint
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado <> 'programado' then
    raise exception 'El partido ya comenzó: no se puede cambiar el plantel';
  end if;

  delete from public.partido_jugadores
  where partido_id = p_partido_id and jugador_id = p_jugador_id;
end;
$$;

create or replace function public.comenzar_partido(p_token uuid, p_partido_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
  v_a int;
  v_b int;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado <> 'programado' then
    raise exception 'El partido no está en estado programado';
  end if;

  select (count(*) filter (where equipo = 'A'))::int,
         (count(*) filter (where equipo = 'B'))::int
    into v_a, v_b
  from public.partido_jugadores
  where partido_id = p_partido_id;

  if v_a <> 5 or v_b <> 5 then
    raise exception 'Faltan jugadores: equipo A tiene % de 5 y equipo B tiene % de 5', v_a, v_b;
  end if;

  update public.partidos set estado = 'en_curso' where id = p_partido_id;
end;
$$;

create or replace function public.cargar_resultado(
  p_token      uuid,
  p_partido_id bigint,
  p_goles_a    integer,
  p_goles_b    integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_estado text;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;
  if p_goles_a is null or p_goles_b is null or p_goles_a < 0 or p_goles_b < 0 then
    raise exception 'Los goles deben ser números mayores o iguales a cero';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado <> 'en_curso' then
    raise exception 'Solo se puede cargar el resultado de un partido en curso';
  end if;

  update public.partidos
  set goles_a = p_goles_a, goles_b = p_goles_b
  where id = p_partido_id;
end;
$$;

create or replace function public.finalizar_partido(p_token uuid, p_partido_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_partido public.partidos%rowtype;
begin
  if not public.sesion_valida(p_token) then
    raise exception 'Sesión inválida o vencida';
  end if;

  select * into v_partido from public.partidos where id = p_partido_id;
  if v_partido.estado <> 'en_curso' then
    raise exception 'Solo se puede finalizar un partido en curso';
  end if;
  if v_partido.goles_a is null or v_partido.goles_b is null then
    raise exception 'Cargá el resultado antes de finalizar el partido';
  end if;

  update public.partidos set estado = 'finalizado' where id = p_partido_id;
end;
$$;

-- ============================================================
-- PUNTAJES
-- ============================================================

-- p_puntajes: [{"jugador_id": 1, "puntaje": 7.5}, ...] con los 10 del partido.
-- Solo puede puntuar quien jugó, y solo con el partido finalizado.
create or replace function public.guardar_puntajes(
  p_token      uuid,
  p_partido_id bigint,
  p_puntajes   jsonb
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_autor    bigint;
  v_estado   text;
  v_esperado int;
  v_recibido int;
begin
  v_autor := public.jugador_de_token(p_token);
  if v_autor is null then
    raise exception 'Tenés que entrar como jugador para puntuar';
  end if;

  select estado into v_estado from public.partidos where id = p_partido_id;
  if v_estado <> 'finalizado' then
    raise exception 'Los puntajes se cargan recién cuando el partido está finalizado';
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
$$;

create or replace function public.mis_puntajes(p_token uuid, p_partido_id bigint)
returns table (jugador_id bigint, puntaje numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_autor bigint;
begin
  v_autor := public.jugador_de_token(p_token);
  if v_autor is null then
    raise exception 'Sesión inválida o no sos jugador';
  end if;

  return query
    select pt.jugador_id, pt.puntaje
    from public.puntajes pt
    where pt.partido_id = p_partido_id and pt.autor_id = v_autor;
end;
$$;

-- ============================================================
-- DASHBOARD
-- ============================================================

create or replace function public.estadisticas(p_token uuid)
returns table (
  partidos_jugados int,
  partidos_ganados int,
  partidos_empatados int,
  partidos_perdidos int,
  promedio_general numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_jugador bigint;
begin
  v_jugador := public.jugador_de_token(p_token);
  if v_jugador is null then
    if not public.sesion_valida(p_token) then
      raise exception 'Sesión inválida o vencida';
    end if;
    return query select 0, 0, 0, 0, null::numeric; -- sesión de admin: no juega
    return;
  end if;

  return query
    with mios as (
      select p.goles_a, p.goles_b, pj.equipo
      from public.partido_jugadores pj
      join public.partidos p on p.id = pj.partido_id
      where pj.jugador_id = v_jugador and p.estado = 'finalizado'
    )
    select count(*)::int,
           (count(*) filter (
             where (equipo = 'A' and goles_a > goles_b)
                or (equipo = 'B' and goles_b > goles_a)))::int,
           (count(*) filter (where goles_a = goles_b))::int,
           (count(*) filter (
             where (equipo = 'A' and goles_a < goles_b)
                or (equipo = 'B' and goles_b < goles_a)))::int,
           (select round(avg(pt.puntaje), 2)
            from public.puntajes pt
            where pt.jugador_id = v_jugador)
    from mios;
end;
$$;

create or replace function public.mis_partidos(p_token uuid)
returns table (
  id           bigint,
  fecha        date,
  estado       text,
  equipo       text,
  goles_a      integer,
  goles_b      integer,
  resultado    text,
  mi_promedio  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
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
            where pt.partido_id = p.id and pt.jugador_id = v_jugador)
    from public.partido_jugadores pj
    join public.partidos p on p.id = pj.partido_id
    where pj.jugador_id = v_jugador
    order by p.fecha desc, p.id desc;
end;
$$;

-- ============================================================
-- PERMISOS
-- ============================================================

do $$
declare
  f text;
begin
  foreach f in array array[
    'jugador_de_token(uuid)',
    'sesion_valida(uuid)',
    'iniciar_sesion(text, text)',
    'cerrar_sesion(uuid)',
    'listar_jugadores(uuid, boolean)',
    'crear_jugador(uuid, text, text, text, text, text)',
    'actualizar_jugador(uuid, bigint, text, text, text, text, text)',
    'eliminar_jugador(uuid, bigint)',
    'proximo_jueves()',
    'crear_partido(uuid, date)',
    'listar_partidos(uuid)',
    'obtener_partido(uuid, bigint)',
    'plantel_partido(uuid, bigint)',
    'agregar_jugador_partido(uuid, bigint, bigint, text)',
    'quitar_jugador_partido(uuid, bigint, bigint)',
    'comenzar_partido(uuid, bigint)',
    'cargar_resultado(uuid, bigint, integer, integer)',
    'finalizar_partido(uuid, bigint)',
    'guardar_puntajes(uuid, bigint, jsonb)',
    'mis_puntajes(uuid, bigint)',
    'estadisticas(uuid)',
    'mis_partidos(uuid)'
  ] loop
    execute format('revoke all on function public.%s from public', f);
    execute format('grant execute on function public.%s to anon, authenticated', f);
  end loop;
end;
$$;

-- ============================================================
-- SEMILLA
-- ============================================================

-- El usuario que ya existía queda también como jugador, con las mismas
-- credenciales, para poder entrar y probar el circuito completo.
insert into public.jugadores (nombre, apellido, apodo, email, clave)
values ('Eduardo', 'Mass', null, 'eduardomass@gmail.com', 'fenixFENIX123')
on conflict (email) do nothing;
