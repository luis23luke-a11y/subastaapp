// Pruebas del adaptador del Portal de Subastas del BOE sobre paginas reales
// guardadas en tests/fixtures/boe/ el 24 de octubre de 2026. No se toca la red.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  AdaptadorBOE, camposDeTabla, cuotaDeTitulo, decodificarEntidades, estadoDeCabecera,
  fechaIso, importe, noExiste, numeroDeLotes, parsearBusqueda, parsearPujas,
  parsearSubasta, tipoDeBien, tipoDeSubasta, type Obtenido,
} from "@/ingesta/adaptadores/boe";
import { comunidadDeProvincia } from "@/datos/provincias";

const CARPETA = join(process.cwd(), "tests", "fixtures", "boe");
const fixture = (nombre: string) => readFileSync(join(CARPETA, nombre), "utf8");

/** Sirve las paginas guardadas segun la URL que pide el adaptador. */
function obtenerDeFixtures(peticiones: string[] = []) {
  return async (url: string): Promise<Obtenido> => {
    peticiones.push(url);
    const u = new URL(url);
    const ok = (nombre: string): Obtenido => ({ estado: 200, cuerpo: fixture(nombre) });

    if (u.pathname.endsWith("subastas_ava.php")) {
      if (u.searchParams.get("accion") === "Mas") return ok("busqueda-pag2.html");
      return u.searchParams.get("dato[2]") === "EJ" ? ok("busqueda-pag1.html") : ok("busqueda-vacia.html");
    }

    const id = u.searchParams.get("idSub") ?? "";
    const ver = u.searchParams.get("ver") ?? "1";
    const idLote = u.searchParams.get("idLote");
    const prefijo: Record<string, string> = {
      "SUB-JA-2021-163298": "judicial",
      "SUB-JA-2024-230270": "lotes",
      "SUB-AT-2026-25R1586001084": "aeat",
      "SUB-NH-2026-1626098": "notarial",
      "SUB-AT-2025-20R0886001487": "suspendida",
      "SUB-AT-2026-25R4586001030": "proxima",
      "SUB-JA-2026-258000": "concluida",
      "SUB-JA-2026-250000": "no-existe",
    };
    const p = prefijo[id];
    if (!p) return { estado: 404, cuerpo: "" };

    if (p === "lotes" && ver === "3") {
      if (idLote === "3") return ok("lotes-ver3-lote3.html");
      if (idLote && idLote !== "1") {
        // Solo hay guardadas las paginas de los lotes 1 y 3: el resto se
        // fabrica renumerando la del lote 1.
        const html = fixture("lotes-ver3.html")
          .replaceAll('id="idBloqueLote1"', `id="idBloqueLote${idLote}"`)
          .replaceAll("<h3>Lote 1</h3>", `<h3>Lote ${idLote}</h3>`);
        return { estado: 200, cuerpo: html };
      }
    }

    const nombre = `${p}-ver${ver}.html`;
    try {
      return ok(nombre);
    } catch {
      // Para las fichas de las que solo se guardo la pestaña general, el
      // resto de pestañas se toma de la judicial.
      return ok(`judicial-ver${ver}.html`);
    }
  };
}

const AHORA = new Date("2026-10-24T12:00:00+02:00");

test("decodifica las entidades numericas y con nombre del portal", () => {
  assert.equal(decodificarEntidades("Informaci&#xF3;n &amp; 91.698,30 &#x20AC;"), "Información & 91.698,30 €");
  assert.equal(decodificarEntidades("Castell&oacute;n"), "Castellón");
});

test("lee pares etiqueta/valor de una tabla con etiquetas decodificadas", () => {
  const c = camposDeTabla(fixture("judicial-ver1.html"));
  assert.equal(c["Identificador"], "SUB-JA-2021-163298");
  assert.equal(c["Cuenta expediente"], "3728 2740 06 0124 19");
  assert.equal(c["Tasación"], "0,00 €");
});

test("los importes con formato del portal se leen y los vacios son null", () => {
  assert.equal(importe("171.670,00 €"), 171_670);
  assert.equal(importe("1.716,70 €"), 1_716.7);
  assert.equal(importe("0,00 €"), null);
  assert.equal(importe("Sin puja mínima"), null);
  assert.equal(importe("Ver valor de subasta en cada lote (los lotes se subastan de forma independiente)"), null);
  assert.equal(importe(undefined), null);
});

test("la fecha se toma de la version ISO que el portal escribe entre parentesis", () => {
  assert.equal(fechaIso("26-10-2026 18:00:00 CET (ISO: 2026-10-26T18:00:00+01:00)"), "2026-10-26T18:00:00+01:00");
  assert.equal(fechaIso(undefined), null);
});

test("el tipo de subasta sale del texto del portal y, si falta, del prefijo del id", () => {
  assert.equal(tipoDeSubasta("JUDICIAL EN VÍA DE APREMIO", "SUB-JA-1"), "judicial");
  assert.equal(tipoDeSubasta("JUDICIAL CONCURSAL", "SUB-JC-1"), "concursal");
  assert.equal(tipoDeSubasta("NOTARIAL HIPOTECARIA", "SUB-NH-1"), "notarial");
  assert.equal(tipoDeSubasta("AGENCIA TRIBUTARIA", "SUB-AT-1"), "aeat");
  assert.equal(tipoDeSubasta("RECAUDACIÓN TRIBUTARIA", "SUB-RC-1"), "otra");
  assert.equal(tipoDeSubasta(undefined, "SUB-JV-1"), "judicial");
});

test("el tipo de bien sale del parentesis de la cabecera y los muebles se descartan", () => {
  assert.equal(tipoDeBien("Bien 1 - Inmueble (Vivienda)"), "vivienda");
  assert.equal(tipoDeBien("Bien 1 - Inmueble (Finca rústica)"), "rustica");
  assert.equal(tipoDeBien("Bien 2 - Inmueble (Trastero)"), "trastero");
  assert.equal(tipoDeBien("Bien 1 - Inmueble (Local comercial)"), "local");
  assert.equal(tipoDeBien("Bien 1 - Vehículo (Turismo)"), null);
});

test("la cuota de propiedad sale del titulo juridico", () => {
  assert.equal(cuotaDeTitulo("PLENO DOMINIO"), 1);
  assert.equal(cuotaDeTitulo("100% PLENO DOMINIO FINCA RÚSTICA"), 1);
  assert.equal(cuotaDeTitulo("50% del pleno dominio"), 0.5);
  assert.equal(cuotaDeTitulo("Mitad indivisa"), 0.5);
  assert.equal(cuotaDeTitulo(undefined), 1);
});

test("la provincia se traduce a comunidad se escriba como se escriba", () => {
  assert.equal(comunidadDeProvincia("Murcia"), "Murcia");
  assert.equal(comunidadDeProvincia("A Coruña"), "Galicia");
  assert.equal(comunidadDeProvincia("CORUÑA, A"), "Galicia");
  assert.equal(comunidadDeProvincia("Valencia/València"), "Comunidad Valenciana");
  assert.equal(comunidadDeProvincia("Illes Balears"), "Baleares");
  assert.equal(comunidadDeProvincia("Marte"), null);
});

test("el listado de busqueda da ids, estados y el enlace a la pagina siguiente", () => {
  const p = parsearBusqueda(fixture("busqueda-pag1.html"));
  assert.deepEqual(p.resultados.map((r) => r.idExterno), [
    "SUB-AT-2026-25R1586001084", "SUB-AT-2026-25R1586001086", "SUB-JA-2024-230270",
  ]);
  assert.ok(p.resultados.every((r) => r.estado === "celebrandose"));
  assert.equal(p.resultados[2]?.expediente, "0383/19");
  assert.equal(p.resultados[0]?.expediente, null);
  assert.ok(p.siguiente?.startsWith("https://subastas.boe.es/subastas_ava.php?accion=Mas&id_busqueda="));

  const ultima = parsearBusqueda(fixture("busqueda-pag2.html"));
  assert.equal(ultima.resultados.length, 2);
  assert.equal(ultima.siguiente, null);
  assert.equal(parsearBusqueda(fixture("busqueda-vacia.html")).resultados.length, 0);
});

test("descubrir recorre los tres estados, sigue la paginacion y no repite ids", async () => {
  const peticiones: string[] = [];
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(peticiones), msEntrePeticiones: 0 });
  const ids: string[] = [];
  for await (const id of a.descubrir(new Date("2021-01-01"))) ids.push(id);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  // PU (vacia) + EJ (dos paginas) + SU (vacia).
  assert.equal(peticiones.length, 4);
  assert.ok(peticiones[0]!.includes("dato%5B2%5D=PU"));
  assert.ok(peticiones[2]!.includes("accion=Mas"));

  // Lo que dijo el listado se aprovecha en el detalle: el expediente.
  const r = await a.detalle("SUB-JA-2024-230270");
  assert.equal(r?.subasta.expediente, "0383/19");
  assert.equal(r?.subasta.estado, "celebrandose");
});

test("una subasta judicial de un solo lote se lee entera", async () => {
  const peticiones: string[] = [];
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(peticiones), msEntrePeticiones: 0 });
  const r = await a.detalle("SUB-JA-2021-163298");
  assert.ok(r);
  const s = r.subasta;

  assert.equal(s.idExterno, "SUB-JA-2021-163298");
  assert.equal(s.tipo, "judicial");
  assert.equal(s.procedimiento, "Judicial en vía de apremio");
  // El expediente solo lo dice el listado; sin haber descubierto, no se inventa.
  assert.equal(s.expediente, null);
  assert.equal(s.autoridad, "Servicio de Gestión Subastas de Murcia");
  assert.equal(s.fechaInicio, "2026-10-06T18:00:00+02:00");
  assert.equal(s.fechaFin, "2026-10-26T18:00:00+01:00");
  assert.equal(s.url, "https://subastas.boe.es/detalleSubasta.php?idSub=SUB-JA-2021-163298");
  // Sin frase en la cabecera y con la conclusion por delante: celebrandose.
  assert.equal(parsearSubasta("SUB-JA-2021-163298", {
    general: fixture("judicial-ver1.html"), autoridad: fixture("judicial-ver2.html"),
    lotes: [fixture("judicial-ver3.html")], pujas: fixture("judicial-ver5.html"),
  }, null, AHORA).estado, "celebrandose");

  assert.equal(s.lotes.length, 1);
  const l = s.lotes[0]!;
  assert.equal(l.numero, 1);
  assert.equal(l.valorSubasta, 171_670);
  assert.equal(l.valorTasacion, null);
  assert.equal(l.pujaMinima, null);
  assert.equal(l.tramos, 1_716.7);
  assert.equal(l.deposito, 8_583.5);
  assert.equal(l.cantidadReclamada, 91_698.3);
  assert.equal(l.numPujas, 0);
  assert.equal(l.pujaActual, null);
  assert.equal(l.viviendaHabitual, false);
  // "No consta (…)" se deja al extractor, que leera el parentesis.
  assert.equal(l.situacion, undefined);
  assert.equal(l.cargasSubsisten, undefined);
  assert.ok(l.cargasTexto?.startsWith("Cargas: Se cancelan la carga registral"));
  assert.ok(l.cargasTexto?.includes("Situación posesoria: No consta (Según Decreto de 18-11-2020"));

  assert.equal(l.bienes.length, 1);
  const b = l.bienes[0]!;
  assert.equal(b.tipo, "vivienda");
  assert.equal(b.referenciaCatastral, "4294810XG8749S0001UF");
  assert.equal(b.direccion, "c/ Cedro, 43. Urbanización Mar Menor Village Golf");
  assert.equal(b.codigoPostal, "30700");
  assert.equal(b.municipio, "TORRE-PACHECO");
  assert.equal(b.provincia, "Murcia");
  assert.equal(b.comunidad, "Murcia");
  assert.equal(b.cuotaPropiedad, 1);
  assert.ok(b.inscripcionRegistral?.startsWith("Finca registral 41461"));
  assert.ok(b.descripcion?.includes("VIVIENDA UNIFAMILIAR AISLADA"));

  // Cuatro pestañas, cuatro piezas de crudo, y una peticion por pestaña.
  assert.deepEqual(r.crudo?.map((c) => c.etiqueta), ["general", "autoridad", "bienes-lote-1", "pujas"]);
  assert.equal(peticiones.length, 4);
});

test("una subasta con diez lotes pide cada lote y lee los importes de cada uno", async () => {
  const peticiones: string[] = [];
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(peticiones), msEntrePeticiones: 0 });
  const r = await a.detalle("SUB-JA-2024-230270");
  assert.ok(r);
  const s = r.subasta;
  assert.equal(numeroDeLotes(fixture("lotes-ver1.html")), 10);
  assert.equal(s.lotes.length, 10);
  // general + autoridad + lote 1 + lotes 2..10 + pujas
  assert.equal(peticiones.length, 13);
  assert.ok(peticiones.some((u) => u.includes("idLote=3")));

  const l1 = s.lotes[0]!;
  assert.equal(l1.valorSubasta, 1_564);
  assert.equal(l1.deposito, 78.2);
  assert.equal(l1.tramos, 400);
  assert.equal(l1.cantidadReclamada, null);
  assert.equal(l1.bienes[0]?.tipo, "trastero");
  assert.equal(l1.bienes[0]?.referenciaCatastral, "2288716XH6028N0074XS");
  // La tabla de pujas por lote: "Con puja" es al menos una.
  assert.ok(s.lotes.every((l) => l.numPujas === 1));

  const l3 = s.lotes[2]!;
  assert.equal(l3.numero, 3);
  assert.ok(l3.bienes[0]?.inscripcionRegistral?.includes("40253"));
  assert.equal(l3.bienes[0]?.tipo, "trastero");
});

test("una subasta de la Agencia Tributaria: finca rustica, cargas como importe y comunidad", async () => {
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(), msEntrePeticiones: 0 });
  const r = await a.detalle("SUB-AT-2026-25R1586001084");
  assert.ok(r);
  const s = r.subasta;
  assert.equal(s.tipo, "aeat");
  assert.equal(s.expediente, null);
  assert.ok(s.autoridad?.startsWith("U.R. SUBASTAS GALICIA"));
  const l = s.lotes[0]!;
  assert.equal(l.valorSubasta, 504.06);
  assert.equal(l.valorTasacion, 504.06);
  assert.equal(l.pujaMinima, 50.41);
  // "Cargas: 0,00 €" es un dato publicado: no hay cargas que subsistan.
  assert.equal(l.cargasSubsisten, false);
  assert.equal(l.cargasImporte, 0);
  const b = l.bienes[0]!;
  assert.equal(b.tipo, "rustica");
  assert.equal(b.provincia, "A Coruña");
  assert.equal(b.comunidad, "Galicia");
  assert.equal(b.municipio, "SOMOZAS (AS)");
  assert.equal(b.cuotaPropiedad, 1);
});

test("una subasta notarial se clasifica como tal", async () => {
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(), msEntrePeticiones: 0 });
  const r = await a.detalle("SUB-NH-2026-1626098");
  assert.equal(r?.subasta.tipo, "notarial");
  assert.equal(r?.subasta.procedimiento, "Notarial hipotecaria");
});

test("el estado se lee de la cabecera de la ficha cuando el portal lo dice", async () => {
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(), msEntrePeticiones: 0 });
  assert.equal((await a.detalle("SUB-AT-2025-20R0886001487"))?.subasta.estado, "suspendida");
  assert.equal((await a.detalle("SUB-JA-2026-258000"))?.subasta.estado, "puja_concluida");
  assert.equal(estadoDeCabecera("La subasta ha sido cancelada por la autoridad gestora"), "cancelada");
  assert.equal(estadoDeCabecera("ADVERTENCIA: durante el plazo de ejecución…"), null);
});

test("sin fecha de inicio es proxima apertura, y la pestaña de pujas no cuenta", async () => {
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(), msEntrePeticiones: 0 });
  const r = await a.detalle("SUB-AT-2026-25R4586001030");
  assert.ok(r);
  assert.equal(r.subasta.estado, "publicada");
  assert.equal(r.subasta.fechaInicio, null);
  assert.equal(r.subasta.lotes[0]?.numPujas, null);
});

test("el estado del listado manda sobre la deduccion por fechas", () => {
  const paginas = {
    general: fixture("judicial-ver1.html"), autoridad: fixture("judicial-ver2.html"),
    lotes: [fixture("judicial-ver3.html")], pujas: fixture("judicial-ver5.html"),
  };
  assert.equal(parsearSubasta("SUB-JA-2021-163298", paginas, { estado: "suspendida", expediente: null }, AHORA).estado, "suspendida");
  // Pasada la fecha de conclusion y sin frase en la cabecera: concluida.
  assert.equal(parsearSubasta("SUB-JA-2021-163298", paginas, null, new Date("2026-12-01")).estado, "puja_concluida");
});

test("una subasta retirada del portal devuelve null y no un error", async () => {
  assert.equal(noExiste(fixture("no-existe-ver1.html")), true);
  assert.equal(noExiste(fixture("judicial-ver1.html")), false);
  const a = new AdaptadorBOE({ obtener: obtenerDeFixtures(), msEntrePeticiones: 0 });
  assert.equal(await a.detalle("SUB-JA-2026-250000"), null);
});

test("las pujas: ninguna, alguna, secreta y la tabla por lotes", () => {
  assert.equal(parsearPujas(fixture("judicial-ver5.html")).porLote.get(0), 0);
  assert.equal(parsearPujas(fixture("con-puja-ver5.html")).porLote.get(0), 1);
  assert.equal(parsearPujas(fixture("secreta-ver5.html")).porLote.get(0), null);
  const lotes = parsearPujas(fixture("lotes-ver5.html")).porLote;
  assert.equal(lotes.size, 10);
  assert.equal(lotes.get(7), 1);
});

test("un error HTTP del portal se propaga con el codigo en el mensaje, para que la cola decida", async () => {
  const a = new AdaptadorBOE({
    obtener: async () => ({ estado: 503, cuerpo: "" }), msEntrePeticiones: 0,
  });
  await assert.rejects(a.detalle("SUB-JA-2021-163298"), /HTTP 503/);
});
