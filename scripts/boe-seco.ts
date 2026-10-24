// Pasada en seco contra el Portal de Subastas del BOE: descubre y lee unas
// pocas fichas, y enseña lo que el adaptador y el extractor sacan de ellas,
// sin escribir nada en la base. Para comprobar el rastreo antes de encolarlo
// de verdad, o para mirar una subasta concreta.
//
//   npm run boe:seco                      descubre y lee las 3 primeras
//   npm run boe:seco -- --cuantas=10      lee 10
//   npm run boe:seco -- --id=SUB-JA-2026-261020   solo esa ficha
//   npm run boe:seco -- --json            la SubastaBruta entera, en JSON

import { AdaptadorBOE } from "@/ingesta/adaptadores/boe";
import { extraerDeTexto } from "@/enriquecimiento/extraer";

function argumento(nombre: string, porDefecto?: string): string | undefined {
  const pref = `--${nombre}=`;
  return process.argv.find((a) => a.startsWith(pref))?.slice(pref.length) ?? porDefecto;
}

async function principal() {
  const adaptador = new AdaptadorBOE();
  const cuantas = Number.parseInt(argumento("cuantas", "3")!, 10);
  const id = argumento("id");
  const enJson = process.argv.includes("--json");

  const ids: string[] = [];
  if (id) ids.push(id);
  else {
    for await (const i of adaptador.descubrir(new Date())) {
      ids.push(i);
      if (ids.length >= cuantas) break;
    }
    console.info(`descubiertas ${ids.length} (se para al llegar a ${cuantas}; el portal tiene más)`);
  }

  for (const i of ids) {
    const r = await adaptador.detalle(i);
    if (!r) { console.info(`${i}: no existe en el portal`); continue; }
    const s = r.subasta;
    if (enJson) { console.info(JSON.stringify(s, null, 2)); continue; }
    console.info(`\n${s.idExterno}  ${s.tipo}  ${s.estado}  ${s.autoridad ?? "-"}`);
    console.info(`  expediente ${s.expediente ?? "-"} · ${s.fechaInicio ?? "sin inicio"} → ${s.fechaFin ?? "sin fin"}`);
    for (const l of s.lotes) {
      console.info(`  lote ${l.numero}: salida ${l.valorSubasta ?? "-"} · tasación ${l.valorTasacion ?? "-"} · depósito ${l.deposito ?? "-"} · pujas ${l.numPujas ?? "?"}`);
      for (const b of l.bienes) {
        console.info(`    ${b.tipo}  ${b.direccion ?? "-"} · ${b.codigoPostal ?? ""} ${b.municipio ?? "-"} (${b.provincia ?? "-"} / ${b.comunidad ?? "sin comunidad"}) · refcat ${b.referenciaCatastral ?? "-"} · cuota ${b.cuotaPropiedad}`);
      }
      const e = extraerDeTexto(l.cargasTexto);
      console.info(`    publicado: situación ${l.situacion ?? "sin dato"} · habitual ${l.viviendaHabitual ?? "sin dato"} · cargas ${l.cargasSubsisten ?? "sin dato"}${l.cargasImporte != null ? ` (${l.cargasImporte} €)` : ""}`);
      console.info(`    extractor: cargas ${e.cargasSubsisten.valor} (${e.cargasSubsisten.confianza.toFixed(2)}, ${e.cargasSubsisten.regla}) · situación ${e.situacion.valor} (${e.situacion.confianza.toFixed(2)}) · fórmulas ${e.formulasDeEstilo.length}`);
      if (e.cargasSubsisten.evidencia) console.info(`      cita cargas: «${e.cargasSubsisten.evidencia.slice(0, 140)}»`);
      if (e.situacion.evidencia) console.info(`      cita situación: «${e.situacion.evidencia.slice(0, 140)}»`);
    }
  }
  console.info(`\n${adaptador.peticiones()} peticiones al portal`);
}

principal().catch((err) => { console.error(err); process.exit(1); });
