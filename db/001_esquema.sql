-- ---------------------------------------------------------------------------
-- 001  Esquema base
--
-- Dos principios que no se negocian:
--   1. Nada se borra. Las subastas desaparecen del portal de origen; aqui se
--      quedan, porque el historico de adjudicaciones es el activo del producto.
--   2. El dato de la fuente y el dato derivado viven en tablas distintas. Lo
--      que dijo el boletin va en subasta/lote/bien; lo que calculamos nosotros
--      va en bien_enriquecido. Nunca se mezclan.
-- ---------------------------------------------------------------------------

create extension if not exists postgis;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- Tipos ---------------------------------------------------------------------

do $$ begin
  create type tipo_subasta as enum
    ('judicial', 'aeat', 'seguridad_social', 'notarial', 'concursal', 'otra');
exception when duplicate_object then null; end $$;

do $$ begin
  create type estado_subasta as enum
    ('publicada', 'celebrandose', 'puja_concluida', 'finalizada',
     'cancelada', 'suspendida', 'desconocido');
exception when duplicate_object then null; end $$;

do $$ begin
  create type tipo_bien as enum
    ('vivienda', 'garaje', 'trastero', 'local', 'nave', 'oficina',
     'suelo', 'rustica', 'edificio', 'otro');
exception when duplicate_object then null; end $$;

do $$ begin
  create type situacion_posesoria as enum ('ocupado', 'libre', 'desconocido');
exception when duplicate_object then null; end $$;

-- De donde salen las coordenadas. Pintar un punto sin decir su precision es
-- mentirle al usuario: una direccion incompleta acaba en el centro del pueblo.
do $$ begin
  create type precision_geo as enum
    ('catastral', 'portal', 'via', 'municipio', 'ninguna');
exception when duplicate_object then null; end $$;

-- Subasta -------------------------------------------------------------------

create table if not exists subasta (
  id                  bigserial primary key,
  fuente              text not null,
  id_externo          text not null,
  tipo                tipo_subasta   not null default 'judicial',
  estado              estado_subasta not null default 'desconocido',
  procedimiento       text,
  expediente          text,
  autoridad           text,
  fecha_publicacion   timestamptz,
  fecha_inicio        timestamptz,
  fecha_fin           timestamptz,
  url                 text,
  hash_contenido      text,
  visto_primera_vez   timestamptz not null default now(),
  visto_ultima_vez    timestamptz not null default now(),
  -- Payload normalizado tal como lo devolvio el adaptador. Permite reparsear
  -- sin volver a la fuente cuando mejoremos la extraccion.
  bruto               jsonb,
  constraint subasta_fuente_externo_uk unique (fuente, id_externo)
);

create index if not exists subasta_fecha_fin_ix    on subasta (fecha_fin desc nulls last);
create index if not exists subasta_estado_ix       on subasta (estado);
create index if not exists subasta_tipo_ix         on subasta (tipo);
create index if not exists subasta_publicacion_ix  on subasta (fecha_publicacion desc nulls last);

-- Lote ----------------------------------------------------------------------
-- La unidad que el usuario busca y por la que puja. Una subasta tiene N lotes
-- y un lote tiene M bienes: confundirlo obliga a rehacer la ingesta entera.

create table if not exists lote (
  id                    bigserial primary key,
  subasta_id            bigint not null references subasta(id) on delete cascade,
  numero                int    not null default 1,
  valor_subasta         numeric(14,2),
  valor_tasacion        numeric(14,2),
  puja_minima           numeric(14,2),
  deposito              numeric(14,2),
  tramos                numeric(14,2),
  cantidad_reclamada    numeric(14,2),
  estado                estado_subasta,
  -- Texto libre del boletin, redactado a mano por cada juzgado. Se conserva
  -- siempre: es la prueba de lo que afirman los campos extraidos de abajo.
  cargas_texto          text,
  -- Extraido del texto anterior. Orientativo mientras confianza_extraccion
  -- no sea alta; la interfaz muestra el texto original al lado.
  cargas_importe        numeric(14,2),
  cargas_subsisten      boolean,
  situacion             situacion_posesoria not null default 'desconocido',
  vivienda_habitual     boolean,
  confianza_extraccion  real check (confianza_extraccion between 0 and 1),
  constraint lote_subasta_numero_uk unique (subasta_id, numero)
);

create index if not exists lote_subasta_ix       on lote (subasta_id);
create index if not exists lote_valor_ix         on lote (valor_subasta);
create index if not exists lote_situacion_ix     on lote (situacion);

-- Bien ----------------------------------------------------------------------

create table if not exists bien (
  id                    bigserial primary key,
  lote_id               bigint not null references lote(id) on delete cascade,
  tipo                  tipo_bien not null default 'otro',
  descripcion           text,
  direccion             text,
  codigo_postal         text,
  municipio             text,
  provincia             text,
  -- Necesaria para el ITP, que es competencia autonomica.
  comunidad             text,
  referencia_catastral  text,
  -- 1.0000 es pleno dominio. Muchos lotes son una mitad indivisa y eso cambia
  -- por completo lo que estas comprando.
  cuota_propiedad       numeric(6,4) not null default 1
                          check (cuota_propiedad > 0 and cuota_propiedad <= 1),
  inscripcion_registral text,
  -- Orden dentro del lote. Es la clave estable del bien: permite reingestar
  -- sin borrarlo, y por tanto sin perder la geocodificacion ya calculada.
  orden                 int not null default 1,
  constraint bien_lote_orden_uk unique (lote_id, orden)
);

create index if not exists bien_lote_ix        on bien (lote_id);
create index if not exists bien_provincia_ix   on bien (provincia);
create index if not exists bien_tipo_ix        on bien (tipo);
create index if not exists bien_refcat_ix      on bien (referencia_catastral)
  where referencia_catastral is not null;
create index if not exists bien_municipio_trgm on bien using gin (municipio gin_trgm_ops);
create index if not exists bien_direccion_trgm on bien using gin (direccion gin_trgm_ops);

-- Enriquecido ---------------------------------------------------------------
-- Todo lo que calculamos nosotros. Separado a proposito: si manana cambia el
-- modelo de valoracion, se borra y se recalcula sin tocar el dato de origen.

create table if not exists bien_enriquecido (
  bien_id            bigint primary key references bien(id) on delete cascade,
  geom               geometry(Point, 4326),
  precision_geo      precision_geo not null default 'ninguna',
  m2_construidos     numeric(10,2),
  m2_utiles          numeric(10,2),
  anio_construccion  int,
  uso_catastral      text,
  precio_m2_zona     numeric(12,2),
  valor_estimado     numeric(14,2),
  confianza_valor    real check (confianza_valor between 0 and 1),
  actualizado        timestamptz not null default now()
);

create index if not exists enriquecido_geom_ix  on bien_enriquecido using gist (geom);
create index if not exists enriquecido_valor_ix on bien_enriquecido (valor_estimado);

-- Snapshots -----------------------------------------------------------------
-- Una fila por cada vez que vemos cambiar un lote. Es la serie temporal con la
-- que mas adelante se entrena el scoring de oportunidad.

create table if not exists lote_snapshot (
  id            bigserial primary key,
  lote_id       bigint not null references lote(id) on delete cascade,
  momento       timestamptz not null default now(),
  estado        estado_subasta,
  num_pujas     int,
  puja_actual   numeric(14,2)
);

create index if not exists snapshot_lote_momento_ix on lote_snapshot (lote_id, momento desc);

-- Acceso --------------------------------------------------------------------
-- Producto cerrado: no hay registro abierto. Solo entra quien esta en esta
-- tabla, que ademas evita que los datos personales de los anuncios acaben
-- indexados en Google.

create table if not exists usuario (
  id             bigserial primary key,
  email          citext not null unique,
  nombre         text,
  activo         boolean not null default true,
  creado         timestamptz not null default now(),
  ultimo_acceso  timestamptz
);

create table if not exists token_acceso (
  token       text primary key,
  usuario_id  bigint not null references usuario(id) on delete cascade,
  expira      timestamptz not null,
  usado       timestamptz
);

create table if not exists sesion (
  id          text primary key,
  usuario_id  bigint not null references usuario(id) on delete cascade,
  creada      timestamptz not null default now(),
  expira      timestamptz not null
);

create index if not exists sesion_usuario_ix on sesion (usuario_id);

-- Alertas y favoritos -------------------------------------------------------

create table if not exists alerta (
  id            bigserial primary key,
  usuario_id    bigint not null references usuario(id) on delete cascade,
  nombre        text not null,
  filtro        jsonb not null,
  canal         text not null default 'email' check (canal in ('email', 'telegram')),
  frecuencia    text not null default 'diaria'
                  check (frecuencia in ('inmediata', 'diaria', 'semanal')),
  activa        boolean not null default true,
  ultimo_envio  timestamptz
);

create index if not exists alerta_usuario_ix on alerta (usuario_id) where activa;

create table if not exists favorito (
  usuario_id  bigint not null references usuario(id) on delete cascade,
  lote_id     bigint not null references lote(id) on delete cascade,
  creado      timestamptz not null default now(),
  nota        text,
  primary key (usuario_id, lote_id)
);
