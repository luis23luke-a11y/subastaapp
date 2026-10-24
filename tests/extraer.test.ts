import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerDeTexto, UMBRAL_REVISION } from "../src/enriquecimiento/extraer";

// La fórmula que la LEC obliga a incluir en TODOS los anuncios.
const FORMULA_LEC =
  "Las cargas y gravámenes anteriores y los preferentes, si los hubiere, al " +
  "crédito del actor continuarán subsistentes, entendiéndose que el rematante " +
  "los acepta y queda subrogado en la responsabilidad de los mismos.";

test("la fórmula de la LEC por sí sola NO significa que haya cargas", () => {
  const r = extraerDeTexto(FORMULA_LEC);
  assert.equal(r.cargasSubsisten.valor, null, "marcarlo como que hay cargas haría inútil el filtro");
  assert.ok(r.cargasSubsisten.confianza < 0.5);
  assert.ok(r.formulasDeEstilo.length > 0, "debe reconocerla como fórmula de estilo");
  assert.equal(r.cargasSubsisten.regla, "solo-formula-de-estilo");
});

test("una certificación negativa gana a la fórmula de estilo", () => {
  const r = extraerDeTexto(
    `${FORMULA_LEC} Según certificación registral, no constan cargas anteriores ni preferentes a la del ejecutante.`,
  );
  assert.equal(r.cargasSubsisten.valor, false);
  assert.ok(r.cargasSubsisten.confianza > 0.85);
  assert.ok(r.cargasSubsisten.evidencia?.includes("no constan cargas anteriores"));
});

test("una carga concreta con importe sí cuenta, y se extrae el importe", () => {
  const r = extraerDeTexto(
    `${FORMULA_LEC} Subsisten las cargas anteriores a la hipoteca ejecutada por importe aproximado de 42.350,20 euros.`,
  );
  assert.equal(r.cargasSubsisten.valor, true);
  assert.equal(r.cargasImporte.valor, 42350.2);
  assert.ok(r.cargasImporte.evidencia?.includes("42.350,20"));
});

test("un embargo anterior cuenta; uno posterior no debería arrastrarlo", () => {
  const anterior = extraerDeTexto("Consta embargo anterior a favor de la Agencia Tributaria por importe de 12.000 euros.");
  assert.equal(anterior.cargasSubsisten.valor, true);
  assert.equal(anterior.cargasImporte.valor, 12000);
});

test("reconoce el inmueble ocupado y por quién", () => {
  const r = extraerDeTexto("La finca se encuentra ocupada por el ejecutado y su familia.");
  assert.equal(r.situacion.valor, "ocupado");
  assert.ok(r.situacion.confianza > 0.85);
  assert.ok(r.situacion.evidencia?.includes("ocupada por el ejecutado"));
});

test("reconoce el inmueble libre", () => {
  assert.equal(extraerDeTexto("El inmueble se encuentra libre de ocupantes.").situacion.valor, "libre");
  assert.equal(extraerDeTexto("La vivienda se encuentra desocupada.").situacion.valor, "libre");
});

test("arrendado es ocupado: hay alguien dentro con derecho", () => {
  assert.equal(extraerDeTexto("El local se encuentra arrendado a un tercero.").situacion.valor, "ocupado");
});

test("distingue no saber de saber que está libre", () => {
  const r = extraerDeTexto("No consta en autos la situación posesoria del inmueble.");
  assert.equal(r.situacion.valor, "desconocido");
  assert.ok(r.situacion.confianza > 0.85, "saber que no se sabe también es información");
});

test("vivienda habitual, y su negación gana", () => {
  assert.equal(extraerDeTexto("La vivienda constituye el domicilio habitual del ejecutado.").viviendaHabitual.valor, true);
  assert.equal(extraerDeTexto("No constituye la vivienda habitual del deudor.").viviendaHabitual.valor, false);
});

test("sin texto no se inventa nada y se pide revisión", () => {
  for (const t of [null, undefined, "", "   "]) {
    const r = extraerDeTexto(t);
    assert.equal(r.cargasSubsisten.valor, null);
    assert.equal(r.situacion.valor, "desconocido");
    assert.equal(r.confianzaGlobal, 0);
    assert.equal(r.necesitaRevision, true);
  }
});

test("la confianza global es la del campo peor resuelto, no el promedio", () => {
  // Cargas clarísimas, posesión sin mencionar: no puede dar confianza alta.
  const r = extraerDeTexto("No constan cargas anteriores ni preferentes.");
  assert.equal(r.cargasSubsisten.confianza > 0.85, true);
  assert.equal(r.situacion.confianza, 0);
  assert.equal(r.confianzaGlobal, 0);
  assert.equal(r.necesitaRevision, true);
});

test("un anuncio completo y claro no necesita revisión", () => {
  const r = extraerDeTexto(
    "Según certificación registral no constan cargas anteriores ni preferentes a la del ejecutante. " +
    "La finca se encuentra libre de ocupantes.",
  );
  assert.equal(r.cargasSubsisten.valor, false);
  assert.equal(r.situacion.valor, "libre");
  assert.ok(r.confianzaGlobal >= UMBRAL_REVISION);
  assert.equal(r.necesitaRevision, false);
});

test("la evidencia es la frase entera del anuncio, no un trozo suelto", () => {
  const r = extraerDeTexto(
    "Primero. La finca se encuentra ocupada por el ejecutado. Segundo. Otra cosa.",
  );
  assert.equal(r.situacion.evidencia, "La finca se encuentra ocupada por el ejecutado.");
});

test("los acentos no impiden reconocer la frase", () => {
  const r = extraerDeTexto("No consta la situación posesoria ni la existencia de cargas.");
  assert.equal(r.situacion.valor, "desconocido");
  assert.equal(r.cargasSubsisten.valor, false);
});

test("«no consta si existen cargas» es no saber, no es que no haya", () => {
  const r = extraerDeTexto("No consta si existen cargas anteriores sobre la finca.");
  assert.notEqual(r.cargasSubsisten.valor, false,
    "confundir la duda con la ausencia es el error que más dinero cuesta aquí");
  assert.ok(r.necesitaRevision);
});

test("el punto de los miles no parte la cita por la mitad", () => {
  const r = extraerDeTexto(
    "Consta embargo anterior a favor de la Agencia Tributaria por importe de 44.900 euros. Nada más.",
  );
  assert.equal(r.cargasImporte.valor, 44900);
  assert.ok(r.cargasSubsisten.evidencia?.includes("44.900 euros"),
    `la cita se cortó: ${r.cargasSubsisten.evidencia}`);
  assert.ok(!r.cargasSubsisten.evidencia?.includes("Nada más"),
    "tampoco debe tragarse la frase siguiente");
});

test("tampoco la parte una abreviatura como n.º", () => {
  const r = extraerDeTexto("La finca se encuentra ocupada por el ejecutado, finca n.º 1.234 del registro.");
  assert.ok(r.situacion.evidencia?.includes("n.º 1.234"), r.situacion.evidencia ?? "sin evidencia");
});

test("la fórmula del Servicio de Subastas de Murcia no cuenta como prueba de cargas", () => {
  const e = extraerDeTexto(
    "Cargas: Se cancelan la carga registral que da lugar a esta subasta y todas las posteriores. " +
    "Se mantendrán las cargas o gravámenes anteriores o del mismo rango, y quien se adjudique el " +
    "inmueble se subroga en la responsabilidad que garantizan. Los interesados han de comprobar qué " +
    "cargas existen y su estado actual.",
  );
  assert.equal(e.cargasSubsisten.valor, null);
  assert.ok(e.formulasDeEstilo.includes("formula-mantendran-anteriores"));
});
