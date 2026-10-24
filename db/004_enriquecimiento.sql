-- ---------------------------------------------------------------------------
-- 004  Enriquecimiento
--
-- Cache de las respuestas del Catastro y nuevo tipo de trabajo. El Catastro es
-- un servicio publico y gratuito: la cortesia minima es no preguntarle dos
-- veces lo mismo. Ademas, sus datos cambian poco y el cache convierte un
-- reenriquecimiento masivo en una operacion de segundos.
-- ---------------------------------------------------------------------------

alter type trabajo_tipo add value if not exists 'enriquecer';

create table if not exists catastro_cache (
  operacion   text not null,
  clave       text not null,
  obtenido    timestamptz not null default now(),
  -- La respuesta tal cual, por si manana sacamos mas campos de ella.
  crudo       text not null,
  -- Lo ya parseado, que es lo que se lee en caliente.
  parseado    jsonb,
  error_cod   text,
  error_desc  text,
  primary key (operacion, clave)
);

create index if not exists catastro_cache_obtenido_ix on catastro_cache (obtenido);

-- Cola de bienes por enriquecer. Es una vista, no una tabla: el pendiente se
-- deduce del estado y no hay que mantener ninguna marca a mano.
create or replace view v_bien_por_enriquecer as
select b.id as bien_id, b.lote_id, b.referencia_catastral, b.direccion,
       b.municipio, b.provincia, b.comunidad, b.tipo,
       e.actualizado, e.precision_geo
from bien b
left join bien_enriquecido e on e.bien_id = b.id
where e.bien_id is null
   or e.precision_geo in ('ninguna', 'municipio')
   -- Suelo y rustica no tienen metros construidos: exigirselos los dejaria
   -- pendientes para siempre.
   or (e.m2_construidos is null and b.tipo not in ('suelo', 'rustica'))
   or e.actualizado < now() - interval '180 days';
