-- ---------------------------------------------------------------------------
-- 002  Vista de busqueda
--
-- Aplana lote + subasta + bien principal + enriquecido en la fila que consume
-- el buscador, y calcula ahi los dos campos que el usuario filtra de verdad:
-- el precio por metro y el margen estimado sobre el valor de salida.
--
-- Es una vista normal, no materializada: con unos 12.000 lotes al año el
-- volumen no lo justifica y evita el problema de cuando refrescarla.
-- ---------------------------------------------------------------------------

-- Se recrea entera: "create or replace" no admite insertar columnas en medio,
-- y esta vista crece cada vez que el modelo gana un campo.
drop view if exists v_lote_busqueda;

create view v_lote_busqueda as
select
  l.id                                           as lote_id,
  s.id                                           as subasta_id,
  s.fuente,
  s.id_externo,
  s.tipo,
  coalesce(l.estado, s.estado)                   as estado,
  s.procedimiento,
  s.autoridad,
  s.url,
  s.fecha_publicacion,
  s.fecha_fin,
  l.numero                                       as lote_numero,
  l.valor_subasta,
  l.valor_tasacion,
  l.puja_minima,
  l.deposito,
  l.cargas_importe,
  l.cargas_subsisten,
  l.cargas_texto,
  l.situacion,
  l.vivienda_habitual,
  l.confianza_extraccion,
  l.cargas_evidencia,
  l.situacion_evidencia,
  l.extraccion_regla,
  l.extraccion_origen,
  b.id                                           as bien_id,
  b.tipo                                         as bien_tipo,
  b.direccion,
  b.codigo_postal,
  b.municipio,
  b.provincia,
  b.comunidad,
  b.referencia_catastral,
  b.cuota_propiedad,
  e.geom,
  st_y(e.geom)                                   as lat,
  st_x(e.geom)                                   as lon,
  e.precision_geo,
  e.m2_construidos,
  e.anio_construccion,
  e.precio_m2_zona,
  e.valor_estimado,
  e.confianza_valor,
  (select count(*) from bien b2 where b2.lote_id = l.id)  as num_bienes,
  case
    when e.m2_construidos > 0
    then round(l.valor_subasta / e.m2_construidos, 2)
  end                                            as eur_m2_salida,
  -- Margen bruto sobre el valor de salida, sin costes, pero SI ajustado a la
  -- cuota de propiedad: un lote que es una mitad indivisa vale la mitad, y eso
  -- no es un supuesto nuestro sino lo que se compra. Sin ese ajuste el listado
  -- prometeria un margen que la ficha luego desmiente.
  --
  -- La calculadora completa vive en la aplicacion porque depende de la
  -- comunidad autonoma y del estado posesorio; esto es solo para poder ordenar
  -- y filtrar en SQL.
  case
    when e.valor_estimado > 0 and l.valor_subasta > 0 and coalesce(b.cuota_propiedad, 1) > 0
    then round(
      (e.valor_estimado * coalesce(b.cuota_propiedad, 1) - l.valor_subasta)
        / (e.valor_estimado * coalesce(b.cuota_propiedad, 1)), 4)
  end                                            as margen_bruto
from lote l
join subasta s on s.id = l.subasta_id
-- Bien principal del lote: el de menor orden. Los demas siguen accesibles en
-- la ficha, y num_bienes avisa de que el lote lleva mas de uno.
left join lateral (
  select * from bien bb where bb.lote_id = l.id order by bb.orden, bb.id limit 1
) b on true
left join bien_enriquecido e on e.bien_id = b.id;
