import assert from "node:assert/strict";
import { test } from "node:test";
import { aQuerystring, construirConsulta, leerFiltro } from "../src/lib/filtros";

test("un parametro repetido por el formulario no pierde valores", () => {
  const qs = new URLSearchParams();
  qs.append("tipo_bien", "vivienda");
  qs.append("tipo_bien", "garaje");
  assert.deepEqual(leerFiltro(qs).tipo_bien, ["vivienda", "garaje"]);
});

test("tambien acepta la forma de array que da Next en searchParams", () => {
  const f = leerFiltro({ tipo_bien: ["vivienda", "local"] });
  assert.deepEqual(f.tipo_bien, ["vivienda", "local"]);
});

test("un filtro invalido en la URL no tumba la pagina", () => {
  const f = leerFiltro({ precio_min: "no-es-un-numero", tipo_bien: "marciano" });
  assert.equal(f.orden, "cierre");
  assert.equal(f.pagina, 1);
  assert.equal(f.precio_min, undefined);
});

test("nada se interpola: todo valor va como parametro", () => {
  const f = leerFiltro({ q: "'; drop table subasta; --", provincia: "Castellón" });
  const { where, valores } = construirConsulta(f);
  assert.ok(!where.includes("drop table"));
  assert.ok(valores.includes("'; drop table subasta; --"));
  assert.ok(where.includes("$1"));
});

test("el bbox se traduce a una envolvente con cuatro parametros", () => {
  const f = leerFiltro({ bbox: "-0.5,39.8,0.1,40.1" });
  const { where, valores } = construirConsulta(f);
  assert.ok(where.includes("st_makeenvelope"));
  assert.deepEqual(valores, [-0.5, 39.8, 0.1, 40.1]);
});

test("un bbox con formato malo se ignora en vez de romper el SQL", () => {
  const f = leerFiltro({ bbox: "esto;no;es;un;bbox" });
  assert.equal(f.bbox, undefined);
  assert.equal(construirConsulta(f).where, "");
});

test("sin filtros no hay clausula where", () => {
  assert.equal(construirConsulta(leerFiltro({})).where, "");
});

test("la querystring omite los valores por defecto para dar enlaces limpios", () => {
  assert.equal(aQuerystring({ orden: "cierre", pagina: 1 }), "");
  assert.equal(aQuerystring({ provincia: "Castellón", pagina: 2 }), "provincia=Castell%C3%B3n&pagina=2");
});

test("el filtro de margen minimo llega al SQL", () => {
  const { where, valores } = construirConsulta(leerFiltro({ margen_min: "0.3" }));
  assert.ok(where.includes("margen_bruto >="));
  assert.deepEqual(valores, [0.3]);
});

test("cierran antes pone primero las abiertas, no las que ya cerraron", () => {
  const { orderBy } = construirConsulta(leerFiltro({ orden: "cierre" }));
  assert.ok(orderBy.includes("fecha_fin >= now()"), "debe separar abiertas de cerradas");
  assert.ok(orderBy.indexOf("then 0 else 1 end asc") < orderBy.indexOf("fecha_fin desc"));
});
