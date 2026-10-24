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

/** Bienes que aun no estan bien enriquecidos, para encolarlos. */
export async function bienesPendientes(limite = 500): Promise<number[]> {
  const filas = await consultar<{ bien_id: number }>(
    `select bien_id from v_bien_por_enriquecer order by bien_id limit $1`, [limite],
  );
  return filas.map((f) => f.bien_id);
}
