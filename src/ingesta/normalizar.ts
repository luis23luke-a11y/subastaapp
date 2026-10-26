// ---------------------------------------------------------------------------
// Escritura de lo que devuelve un adaptador.
//
// Reglas:
//   - Idempotente: reingestar la misma subasta no duplica nada.
//   - No destructiva: el bien se actualiza, nunca se borra y se vuelve a
//     insertar, porque colgando de el esta la geocodificacion ya calculada.
//   - Toda diferencia en estado o en pujas deja un snapshot. Ese historico es
//     lo que luego permite predecir a que precio se adjudican las cosas.
//   - Cargas y situacion posesoria se sacan del texto libre aqui mismo, porque
//     es gratis y deterministico. Lo que quede dudoso lo recoge despues el
//     revisor con modelo de lenguaje; lo que diga el adaptador manda sobre lo
//     extraido, porque un dato publicado vale mas que uno deducido.
// ---------------------------------------------------------------------------

import type { PoolClient as Cliente } from "pg";
import { pool } from "@/lib/db";
import { extraerDeTexto } from "@/enriquecimiento/extraer";
import type { SubastaBruta, SubastaRefrescada } from "@/ingesta/adaptador";

interface UltimoSnapshot {
  id: number;
  snap_estado: string | null;
  snap_pujas: number | null;
  snap_puja: number | null;
}

/** El lote y su ultimo snapshot, para no escribir otro cuando nada cambio. */
async function ultimoSnapshot(
  cliente: Cliente, subastaId: number, numero: number,
): Promise<UltimoSnapshot | undefined> {
  // A 12.000 subastas refrescadas al dia, un snapshot por pasada son millones
  // de filas identicas al año.
  const r = await cliente.query<UltimoSnapshot>(
    `select l.id,
            s.estado::text as snap_estado, s.num_pujas as snap_pujas,
            s.puja_actual as snap_puja
     from lote l
     left join lateral (
       select estado, num_pujas, puja_actual from lote_snapshot
       where lote_id = l.id order by momento desc limit 1
     ) s on true
     where l.subasta_id = $1 and l.numero = $2`,
    [subastaId, numero],
  );
  return r.rows[0];
}

/** Escribe un snapshot solo si es el primero del lote o si algo ha cambiado. */
async function anotarSnapshot(
  cliente: Cliente,
  loteId: number,
  anterior: UltimoSnapshot | undefined,
  nuevo: { estado: string; numPujas: number | null; pujaActual: number | null },
): Promise<boolean> {
  const hayCambio =
    !anterior ||
    anterior.snap_estado === null ||
    anterior.snap_estado !== nuevo.estado ||
    anterior.snap_pujas !== nuevo.numPujas ||
    Number(anterior.snap_puja) !== Number(nuevo.pujaActual);
  if (!hayCambio) return false;
  await cliente.query(
    `insert into lote_snapshot (lote_id, estado, num_pujas, puja_actual)
     values ($1,$2,$3,$4)`,
    [loteId, nuevo.estado, nuevo.numPujas, nuevo.pujaActual],
  );
  return true;
}

export interface ResumenGuardado {
  subastaId: number;
  nueva: boolean;
  lotes: number;
  bienes: number;
  snapshots: number;
}

export async function guardarSubasta(
  fuente: string,
  bruta: SubastaBruta,
): Promise<ResumenGuardado> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");

    const sub = await cliente.query<{ id: number; nueva: boolean }>(
      `insert into subasta (fuente, id_externo, tipo, estado, procedimiento, expediente,
                            autoridad, fecha_publicacion, fecha_inicio, fecha_fin, url, bruto)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (fuente, id_externo) do update set
         estado = excluded.estado,
         procedimiento = coalesce(excluded.procedimiento, subasta.procedimiento),
         expediente = coalesce(excluded.expediente, subasta.expediente),
         autoridad = coalesce(excluded.autoridad, subasta.autoridad),
         fecha_publicacion = coalesce(excluded.fecha_publicacion, subasta.fecha_publicacion),
         fecha_inicio = coalesce(excluded.fecha_inicio, subasta.fecha_inicio),
         fecha_fin = coalesce(excluded.fecha_fin, subasta.fecha_fin),
         url = coalesce(excluded.url, subasta.url),
         bruto = excluded.bruto,
         visto_ultima_vez = now()
       returning id, (xmax = 0) as nueva`,
      [fuente, bruta.idExterno, bruta.tipo, bruta.estado, bruta.procedimiento ?? null,
       bruta.expediente ?? null, bruta.autoridad ?? null, bruta.fechaPublicacion ?? null,
       bruta.fechaInicio ?? null, bruta.fechaFin ?? null, bruta.url ?? null,
       JSON.stringify(bruta)],
    );
    const subastaId = sub.rows[0]!.id;
    const nueva = sub.rows[0]!.nueva;

    let bienes = 0;
    let snapshots = 0;

    for (const l of bruta.lotes) {
      const anterior = await ultimoSnapshot(cliente, subastaId, l.numero);

      // Lo que el boletin dice en prosa, convertido en campos.
      const extraido = extraerDeTexto(l.cargasTexto);
      const cargasSubsisten = l.cargasSubsisten ?? extraido.cargasSubsisten.valor;
      const cargasImporte = l.cargasImporte ?? extraido.cargasImporte.valor;
      const situacionFinal = l.situacion ?? extraido.situacion.valor;
      const viviendaHabitual = l.viviendaHabitual ?? extraido.viviendaHabitual.valor;
      const confianza = l.confianzaExtraccion ?? extraido.confianzaGlobal;

      const lote = await cliente.query<{ id: number }>(
        `insert into lote (subasta_id, numero, valor_subasta, valor_tasacion, puja_minima,
                           deposito, tramos, cantidad_reclamada, estado, cargas_texto,
                           cargas_importe, cargas_subsisten, situacion, vivienda_habitual,
                           confianza_extraccion, cargas_evidencia, situacion_evidencia,
                           extraccion_regla, extraccion_origen)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         on conflict (subasta_id, numero) do update set
           valor_subasta = excluded.valor_subasta,
           valor_tasacion = excluded.valor_tasacion,
           puja_minima = excluded.puja_minima,
           deposito = excluded.deposito,
           tramos = excluded.tramos,
           cantidad_reclamada = excluded.cantidad_reclamada,
           estado = excluded.estado,
           cargas_texto = excluded.cargas_texto,
           cargas_importe = excluded.cargas_importe,
           cargas_subsisten = excluded.cargas_subsisten,
           situacion = excluded.situacion,
           vivienda_habitual = excluded.vivienda_habitual,
           confianza_extraccion = excluded.confianza_extraccion,
           cargas_evidencia = excluded.cargas_evidencia,
           situacion_evidencia = excluded.situacion_evidencia,
           extraccion_regla = excluded.extraccion_regla,
           extraccion_origen = excluded.extraccion_origen
         returning id`,
        [subastaId, l.numero, l.valorSubasta ?? null, l.valorTasacion ?? null,
         l.pujaMinima ?? null, l.deposito ?? null, l.tramos ?? null,
         l.cantidadReclamada ?? null, l.estado ?? bruta.estado, l.cargasTexto ?? null,
         cargasImporte, cargasSubsisten, situacionFinal, viviendaHabitual, confianza,
         extraido.cargasSubsisten.evidencia, extraido.situacion.evidencia,
         extraido.situacion.regla, "reglas"],
      );
      const loteId = lote.rows[0]!.id;

      // Snapshot solo si es la primera vez que lo vemos o si algo ha cambiado.
      if (await anotarSnapshot(cliente, loteId, anterior, {
        estado: l.estado ?? bruta.estado,
        numPujas: l.numPujas ?? null,
        pujaActual: l.pujaActual ?? null,
      })) snapshots++;

      let orden = 1;
      for (const b of l.bienes) {
        const bien = await cliente.query<{ id: number }>(
          `insert into bien (lote_id, orden, tipo, descripcion, direccion, codigo_postal,
                             municipio, provincia, comunidad, referencia_catastral,
                             cuota_propiedad, inscripcion_registral)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (lote_id, orden) do update set
             tipo = excluded.tipo,
             descripcion = excluded.descripcion,
             direccion = excluded.direccion,
             codigo_postal = excluded.codigo_postal,
             municipio = excluded.municipio,
             provincia = excluded.provincia,
             comunidad = excluded.comunidad,
             referencia_catastral = coalesce(excluded.referencia_catastral, bien.referencia_catastral),
             cuota_propiedad = excluded.cuota_propiedad,
             inscripcion_registral = excluded.inscripcion_registral
           returning id`,
          [loteId, orden, b.tipo, b.descripcion ?? null, b.direccion ?? null,
           b.codigoPostal ?? null, b.municipio ?? null, b.provincia ?? null,
           b.comunidad ?? null, b.referenciaCatastral ?? null,
           b.cuotaPropiedad ?? 1, b.inscripcionRegistral ?? null],
        );
        const bienId = bien.rows[0]!.id;
        bienes++;
        orden++;

        const e = b.enriquecido;
        if (e) {
          await cliente.query(
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
               precio_m2_zona = coalesce(excluded.precio_m2_zona, bien_enriquecido.precio_m2_zona),
               valor_estimado = coalesce(excluded.valor_estimado, bien_enriquecido.valor_estimado),
               confianza_valor = coalesce(excluded.confianza_valor, bien_enriquecido.confianza_valor),
               actualizado = now()`,
            [bienId, e.lat ?? null, e.lon ?? null, e.precisionGeo ?? "ninguna",
             e.m2Construidos ?? null, e.anioConstruccion ?? null, e.usoCatastral ?? null,
             e.precioM2Zona ?? null, e.valorEstimado ?? null, e.confianzaValor ?? null],
          );
        }
      }
    }

    await cliente.query("commit");
    return { subastaId, nueva, lotes: bruta.lotes.length, bienes, snapshots };
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}

export interface ResumenRefresco {
  subastaId: number;
  lotes: number;
  snapshots: number;
}

/**
 * Escribe lo que trae un refresco ligero: el estado y las fechas de la
 * subasta, el estado de cada lote y, si algo cambio, su snapshot. Ninguna
 * otra columna aparece aqui a proposito: los bienes, las cargas, los importes
 * y el `bruto` completo son de `guardarSubasta`, y un refresco que no los ha
 * pedido no puede pisarlos. Devuelve null si la subasta no esta en la base
 * (un refresco programado para una ficha que nunca llego a guardarse), y
 * entonces el worker la baja entera.
 */
export async function refrescarSubasta(
  fuente: string,
  refresco: SubastaRefrescada,
): Promise<ResumenRefresco | null> {
  const cliente = await pool.connect();
  try {
    await cliente.query("begin");

    const sub = await cliente.query<{ id: number }>(
      `update subasta set
         estado = $3::estado_subasta,
         fecha_inicio = coalesce($4::timestamptz, fecha_inicio),
         fecha_fin = coalesce($5::timestamptz, fecha_fin),
         visto_ultima_vez = now()
       where fuente = $1 and id_externo = $2
       returning id`,
      [fuente, refresco.idExterno, refresco.estado,
       refresco.fechaInicio ?? null, refresco.fechaFin ?? null],
    );
    const subastaId = sub.rows[0]?.id;
    if (subastaId == null) {
      await cliente.query("rollback");
      return null;
    }

    let lotes = 0;
    let snapshots = 0;
    for (const l of refresco.lotes) {
      const anterior = await ultimoSnapshot(cliente, subastaId, l.numero);
      // Un lote que no esta en la base no se inventa aqui: sin sus importes
      // y sus bienes seria una fila vacia. Lo recogera el detalle completo.
      if (!anterior) continue;
      const estado = l.estado ?? refresco.estado;
      await cliente.query(
        `update lote set estado = $2::estado_subasta
         where id = $1 and estado is distinct from $2::estado_subasta`,
        [anterior.id, estado],
      );
      lotes++;
      if (await anotarSnapshot(cliente, anterior.id, anterior, {
        estado, numPujas: l.numPujas ?? null, pujaActual: l.pujaActual ?? null,
      })) snapshots++;
    }

    await cliente.query("commit");
    return { subastaId, lotes, snapshots };
  } catch (err) {
    await cliente.query("rollback");
    throw err;
  } finally {
    cliente.release();
  }
}
