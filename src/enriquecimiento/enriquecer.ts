// Enriquecimiento de un bien: localizarlo, sacar sus datos catastrales y
// valorarlo. Escribe solo en bien_enriquecido, nunca en el dato de origen.

import { consultar, unaFila } from "@/lib/db";
import { geocodificar } from "@/enriquecimiento/geocodificar";
import { valorar } from "@/enriquecimiento/valorar";
import type { TipoBien } from "@/lib/tipos";

export interface ResultadoEnriquecimiento {
  bienId: number;
  precision: string;
  localizado: boolean;
  conSuperficie: boolean;
  conValoracion: boolean;
  comoSeObtuvo: string;
}

export async function enriquecerBien(bienId: number): Promise<ResultadoEnriquecimiento | null> {
  const bien = await unaFila<{
    id: number; tipo: TipoBien; referencia_catastral: string | null;
    direccion: string | null; municipio: string | null; provincia: string | null;
  }>(
    `select id, tipo, referencia_catastral, direccion, municipio, provincia
     from bien where id = $1`,
    [bienId],
  );
  if (!bien) return null;

  const geo = await geocodificar({
    referenciaCatastral: bien.referencia_catastral,
    direccion: bien.direccion,
    municipio: bien.municipio,
    provincia: bien.provincia,
  });

  // Si el Catastro nos da una referencia que el anuncio no traia, se guarda:
  // es dato de origen comprobado, no estimacion nuestra.
  if (geo.referenciaCatastral && !bien.referencia_catastral) {
    await consultar(
      `update bien set referencia_catastral = $2 where id = $1 and referencia_catastral is null`,
      [bienId, geo.referenciaCatastral],
    );
  }

  const valoracion = valorar({
    municipio: bien.municipio,
    tipo: bien.tipo,
    m2Construidos: geo.m2Construidos,
    anioConstruccion: geo.anioConstruccion,
  });

  await consultar(
    `insert into bien_enriquecido (bien_id, geom, precision_geo, m2_construidos,
                                   anio_construccion, uso_catastral, precio_m2_zona,
                                   valor_estimado, confianza_valor, actualizado)
     values ($1,
             case when $2::float8 is null or $3::float8 is null then null
                  else st_setsrid(st_makepoint($3::float8, $2::float8), 4326) end,
             $4, $5, $6, $7, $8, $9, $10, now())
     on conflict (bien_id) do update set
       geom = coalesce(excluded.geom, bien_enriquecido.geom),
       precision_geo = excluded.precision_geo,
       m2_construidos = coalesce(excluded.m2_construidos, bien_enriquecido.m2_construidos),
       anio_construccion = coalesce(excluded.anio_construccion, bien_enriquecido.anio_construccion),
       uso_catastral = coalesce(excluded.uso_catastral, bien_enriquecido.uso_catastral),
       precio_m2_zona = excluded.precio_m2_zona,
       valor_estimado = excluded.valor_estimado,
       confianza_valor = excluded.confianza_valor,
       actualizado = now()`,
    [bienId, geo.lat, geo.lon, geo.precision, geo.m2Construidos, geo.anioConstruccion,
     geo.usoCatastral, valoracion?.precioM2Zona ?? null, valoracion?.valorEstimado ?? null,
     valoracion?.confianza ?? null],
  );

  return {
    bienId,
    precision: geo.precision,
    localizado: geo.lat != null,
    conSuperficie: geo.m2Construidos != null,
    conValoracion: valoracion != null,
    comoSeObtuvo: geo.comoSeObtuvo,
  };
}

// ---------------------------------------------------------------------------
// Que bienes entran en la cola de enriquecimiento.
//
// La vista v_bien_por_enriquecer (db/004_enriquecimiento.sql) dice que bienes
// se podrian enriquecer mejor: los que nunca se han mirado, los que se quedaron
// en el centro del municipio o sin localizar, los que no tienen superficie y
// los que llevan mas de 180 dias sin revisar. Pero "se podria mejorar" no es
// "hay que volver a intentarlo ahora": un bien cuya direccion el Catastro no
// entiende seguira en la vista despues de enriquecerlo, y si se volviera a
// encolar en cada pasada la cola de enriquecer no avanzaria nunca. Es justo lo
// que paso en produccion (24 a 26 de octubre de 2026): el worker encolaba
// "los 50 primeros de la vista" tras cada ficha, que eran siempre los mismos
// 50, y los otros 1.500 bienes no entraban en la cola.
//
// Por eso la cola se alimenta con una sola sentencia que cruza la vista con la
// tabla de trabajos y deja fuera lo que ya esta en cola o en marcha, y lo que
// se intento hace menos de REINTENTO: a esos ya les toco su turno, y volver a
// preguntarle al Catastro lo mismo al dia siguiente es gastar sus peticiones
// para nada. Primero van los que nunca se han enriquecido, y despues los que
// llevan mas tiempo sin revisar. Al chocar con una fila ya existente (que, por
// el filtro, solo puede estar hecha o fallida y ser vieja) manda la peticion
// nueva, como en el modo "programar" de src/ingesta/cola.ts: hay que volver a
// hacerlo, no "si no esta hecho".
//
// Solo bienes de la fuente que se esta ingiriendo: los de muestra no son
// direcciones reales y no hay que preguntarle por ellas al Catastro.
// ---------------------------------------------------------------------------

/** Cuanto se espera antes de volver a intentar un bien que ya se enriquecio
 *  (o fallo) y sigue sin estar bien localizado. */
const REINTENTO = "30 days";

/**
 * Mete en la cola, con prioridad 400, hasta `limite` bienes de la fuente que
 * esten por enriquecer y no esten ya en cola. Devuelve cuantos entraron.
 */
export async function encolarBienesPendientes(fuente: string, limite = 500): Promise<number> {
  const filas = await consultar<{ referencia: string }>(
    `insert into trabajo (fuente, tipo, referencia, prioridad, ejecutar_tras)
     select $1::text, 'enriquecer', v.bien_id::text, 400, now()
     from v_bien_por_enriquecer v
     join lote l on l.id = v.lote_id
     join subasta s on s.id = l.subasta_id and s.fuente = $1::text
     left join trabajo t on t.fuente = $1::text and t.tipo = 'enriquecer'
                        and t.referencia = v.bien_id::text
     where t.id is null
        or (t.estado in ('hecho', 'fallido') and t.actualizado < now() - $3::interval)
     order by v.actualizado nulls first, v.bien_id
     limit $2
     on conflict (fuente, tipo, referencia) do update set
       estado = 'pendiente',
       prioridad = excluded.prioridad,
       ejecutar_tras = excluded.ejecutar_tras,
       intentos = 0,
       ultimo_error = null,
       actualizado = now()
     returning referencia`,
    [fuente, limite, REINTENTO],
  );
  return filas.length;
}
