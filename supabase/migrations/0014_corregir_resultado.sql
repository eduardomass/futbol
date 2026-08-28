-- =============================================================
-- Proyecto Futbol · El admin corrige el resultado en cualquier momento
--
-- `cargar_resultado` solo acepta el partido en `en_curso`: es el paso normal
-- del ciclo de vida, y esa restricción se queda como está. Pero una vez
-- finalizada la fecha no había forma de arreglar un marcador mal cargado
-- —salvo cargar los goles por jugador, que además reescribe la atribución—.
--
-- `corregir_resultado` es la vía del admin para eso, con el mismo criterio
-- que `guardar_grilla_puntajes` frente a `guardar_puntajes`: la función
-- normal respeta el ciclo de vida, y el admin tiene una puerta aparte para
-- corregir sin límite de estado ni de fecha.
--
-- Ojo con la interacción con `guardar_goles` (migración `0011`): el marcador
-- se recalcula con la suma de los goleadores cada vez que se guardan los
-- goles por jugador. Si se corrige a mano y después alguien guarda los
-- goles de esa misma fecha, la corrección se pierde. La pantalla lo avisa.
-- =============================================================

create or replace function public.corregir_resultado(
  p_token      uuid,
  p_partido_id bigint,
  p_goles_a    integer,
  p_goles_b    integer
)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not public.sesion_es_admin(p_token) then
    raise exception 'Solo un administrador puede corregir el resultado de una fecha';
  end if;

  if p_goles_a is null or p_goles_b is null or p_goles_a < 0 or p_goles_b < 0 then
    raise exception 'Los goles deben ser números mayores o iguales a cero';
  end if;

  update public.partidos
  set goles_a = p_goles_a,
      goles_b = p_goles_b
  where id = p_partido_id;

  if not found then
    raise exception 'No existe el partido %', p_partido_id;
  end if;
end;
$fn$;

revoke all on function public.corregir_resultado(uuid, bigint, integer, integer) from public;
grant execute on function public.corregir_resultado(uuid, bigint, integer, integer) to anon, authenticated;
