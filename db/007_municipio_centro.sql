-- ---------------------------------------------------------------------------
-- 007  Centro de cada municipio
--
-- Lo que responde CartoCiudad (IGN) la primera vez que se le pregunta por un
-- municipio: el centro del nucleo de poblacion que lleva su nombre o, si no
-- lo tiene, el del termino entero. Es la caida de la cadena de geocodificacion
-- cuando el Catastro no encuentra el portal (precision "municipio"). Un pueblo
-- no se mueve, asi que no caduca; un municipio que CartoCiudad no conoce se
-- apunta con lat y lon nulas para no preguntarlo en cada pasada.
--
-- No depende de la vista de busqueda ni la vista de ella; por eso puede ir
-- detras de 006 sin romper la regla de que la vista se recrea la ultima.
-- ---------------------------------------------------------------------------

create table if not exists municipio_centro (
  -- Provincia y municipio como los escribe el anuncio, en mayusculas sin
  -- acentos: es la clave con la que se busca, no el nombre oficial.
  provincia   text not null,
  municipio   text not null,
  lat         double precision,
  lon         double precision,
  -- 'poblacion' (nucleo urbano) o 'municipio' (termino entero).
  alcance     text,
  -- El nombre oficial con el que CartoCiudad lo conoce.
  nombre      text,
  obtenido    timestamptz not null default now(),
  primary key (provincia, municipio)
);
