-- ---------------------------------------------------------------------------
-- 003  Infraestructura de ingesta
--
-- La cola y el registro de ejecuciones viven en Postgres. Con unas 12.000
-- subastas al año el volumen no justifica Redis ni nada parecido, y tener la
-- cola en la misma transaccion que los datos evita toda una clase de errores.
-- ---------------------------------------------------------------------------

do $$ begin
  create type trabajo_tipo as enum ('descubrir', 'detalle', 'refrescar');
exception when duplicate_object then null; end $$;

do $$ begin
  create type trabajo_estado as enum ('pendiente', 'ejecutando', 'hecho', 'fallido');
exception when duplicate_object then null; end $$;

-- Cola de trabajo ------------------------------------------------------------

create table if not exists trabajo (
  id            bigserial primary key,
  fuente        text not null,
  tipo          trabajo_tipo not null,
  -- Id externo de la subasta para detalle y refresco; null en descubrimiento.
  referencia    text,
  estado        trabajo_estado not null default 'pendiente',
  -- Lo que decide el orden: menor primero. El refresco de una subasta que
  -- cierra hoy tiene que adelantar a la cola de altas.
  prioridad     int not null default 100,
  ejecutar_tras timestamptz not null default now(),
  intentos      int not null default 0,
  max_intentos  int not null default 5,
  ultimo_error  text,
  creado        timestamptz not null default now(),
  actualizado   timestamptz not null default now(),
  -- Una subasta no puede estar dos veces en la cola para lo mismo.
  constraint trabajo_unico unique (fuente, tipo, referencia)
);

create index if not exists trabajo_listo_ix
  on trabajo (prioridad, ejecutar_tras)
  where estado = 'pendiente';

create index if not exists trabajo_estado_ix on trabajo (estado, actualizado desc);

-- Contenido crudo ------------------------------------------------------------
-- Se guarda lo que devolvio la fuente antes de parsearlo. Cuando mejoremos la
-- extraccion de cargas o de situacion posesoria, se reparsea desde aqui sin
-- volver a pedir nada al origen. Es la diferencia entre mejorar el parser en
-- una tarde o en tres semanas.

create table if not exists contenido_crudo (
  id           bigserial primary key,
  fuente       text not null,
  id_externo   text not null,
  obtenido     timestamptz not null default now(),
  tipo_mime    text,
  hash         text not null,
  contenido    text not null,
  constraint contenido_crudo_uk unique (fuente, id_externo, hash)
);

create index if not exists contenido_crudo_ref_ix
  on contenido_crudo (fuente, id_externo, obtenido desc);

-- Registro de ejecuciones ----------------------------------------------------

create table if not exists ejecucion (
  id            bigserial primary key,
  fuente        text not null,
  inicio        timestamptz not null default now(),
  fin           timestamptz,
  descubiertas  int not null default 0,
  procesadas    int not null default 0,
  nuevas        int not null default 0,
  actualizadas  int not null default 0,
  fallidas      int not null default 0,
  error         text
);

create index if not exists ejecucion_fuente_ix on ejecucion (fuente, inicio desc);

-- Toma de trabajos ------------------------------------------------------------
-- `for update skip locked` permite varios workers en paralelo sin que dos
-- cojan el mismo trabajo, y sin bloquearse entre ellos.

create or replace function tomar_trabajos(p_fuente text, p_cuantos int)
returns setof trabajo as $$
  update trabajo t
  set estado = 'ejecutando', actualizado = now(), intentos = t.intentos + 1
  where t.id in (
    select id from trabajo
    where fuente = p_fuente and estado = 'pendiente' and ejecutar_tras <= now()
    order by prioridad, ejecutar_tras
    limit p_cuantos
    for update skip locked
  )
  returning t.*;
$$ language sql;

-- Un worker que muere deja trabajos en 'ejecutando' para siempre. Esto los
-- devuelve a la cola pasado un tiempo prudencial.
create or replace function rescatar_trabajos(p_minutos int default 30)
returns int as $$
  with devueltos as (
    update trabajo
    set estado = 'pendiente', ejecutar_tras = now(),
        ultimo_error = 'Rescatado: el worker no lo termino'
    where estado = 'ejecutando' and actualizado < now() - make_interval(mins => p_minutos)
    returning 1
  )
  select count(*)::int from devueltos;
$$ language sql;
