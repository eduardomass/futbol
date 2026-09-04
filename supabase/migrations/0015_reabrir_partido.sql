-- =============================================================
-- Proyecto Futbol · El admin reabre una fecha
--
-- El ciclo de vida del partido solo iba para adelante:
-- `programado` → `en_curso` → `finalizado`, sin vuelta atrás. Si alguien
-- finalizaba una fecha por error no había forma de corregirlo desde la app:
-- `cargar_resultado` deja de aceptar, el plantel ya no se edita, y la fecha
-- entra en las estadísticas como jugada. La única salida era un `update` a
-- mano en la base —o borrar la fecha entera con `eliminar_partido`, que se
-- lleva puestos el plantel y todos los puntajes—. Pasó de verdad con la
-- fecha del 2026-09-03.
--
-- `reabrir_partido` es la vuelta atrás, un estado por vez:
--
--   finalizado → en_curso     para volver a tocar el resultado
--   en_curso   → programado   para volver a armar los equipos
--
-- Mismo criterio que `corregir_resultado` (migración `0014`) y que
-- `guardar_grilla_puntajes` frente a `guardar_puntajes`: las funciones del
-- ciclo de vida respetan el ciclo de vida, y el admin tiene una puerta
-- aparte para corregir. Por eso pide `sesion_es_admin`.
--
-- Un paso por llamada, y no dos, a propósito: volver de `finalizado` a
-- `programado` de un saque es raro que sea lo que se quiso hacer, y desde
-- `programado` el plantel se puede editar, y quitar a un jugador borra su
-- fila con los goles que tenía cargados.
--
-- Qué NO toca:
--
-- * El marcador. Reabrir no borra `goles_a` / `goles_b`, así que `finalizar_partido`
--   —que los exige no nulos— vuelve a aceptar sin recargar nada.
-- * Los puntajes ya cargados. Quedan donde están y reaparecen al finalizar de
--   nuevo. Mientras la fecha esté reabierta, `guardar_puntajes` no acepta
--   cargas nuevas (exige `finalizado`), y la fecha sale de
--   `estadisticas_jugadores`, que solo cuenta partidos finalizados.
-- * Los goles por jugador, que `guardar_goles` acepta igual en `en_curso`.
-- =============================================================

create or replace function public.reabrir_partido(p_token uuid, p_partido_id bigint)
returns table (estado_anterior text, estado_nuevo text)
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_anterior text;
  v_nuevo    text;
begin
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede reabrir una fecha';
  end if;

  select p.estado into v_anterior from public.partidos p where p.id = p_partido_id;
  if v_anterior is null then
    raise exception 'No existe el partido %', p_partido_id;
  end if;

  v_nuevo := case v_anterior
               when 'finalizado' then 'en_curso'
               when 'en_curso'   then 'programado'
             end;

  if v_nuevo is null then
    raise exception 'La fecha ya está programada: no hay estado anterior al que volver';
  end if;

  update public.partidos set estado = v_nuevo where id = p_partido_id;

  return query select v_anterior, v_nuevo;
end;
$fn$;

revoke all on function public.reabrir_partido(uuid, bigint) from public;
grant execute on function public.reabrir_partido(uuid, bigint) to anon, authenticated;
