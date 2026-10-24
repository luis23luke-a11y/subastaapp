import assert from "node:assert/strict";
import { test } from "node:test";
import { importeEnCifras, importesEnTexto, numeroEnLetras } from "../src/enriquecimiento/importe";

test("formato español de miles y decimales", () => {
  assert.equal(importeEnCifras("1.234.567,89"), 1234567.89);
  assert.equal(importeEnCifras("12.000"), 12000);
  assert.equal(importeEnCifras("450"), 450);
  assert.equal(importeEnCifras("1.234"), 1234);
});

test("descarta lo ambiguo en vez de arriesgarse", () => {
  // "1.5" podría ser 1,5 o 15: de aquí sale un coste, así que no se adivina.
  assert.equal(importeEnCifras("1.5"), null);
  assert.equal(importeEnCifras("1,500"), null);
  assert.equal(importeEnCifras("1.23.456"), null);
  assert.equal(importeEnCifras("abc"), null);
  assert.equal(importeEnCifras(""), null);
});

test("números escritos en letras", () => {
  assert.equal(numeroEnLetras("doce mil"), 12000);
  assert.equal(numeroEnLetras("ciento veinte mil"), 120000);
  assert.equal(numeroEnLetras("dos millones"), 2000000);
  assert.equal(numeroEnLetras("cuarenta y dos mil quinientos"), 42500);
  assert.equal(numeroEnLetras("pepino"), null);
});

test("encuentra los importes con moneda y dónde están", () => {
  const t = "Subsisten cargas por importe de 42.350,20 euros y costas de 1.200 €.";
  const h = importesEnTexto(t);
  assert.deepEqual(h.map((x) => x.valor), [42350.2, 1200]);
  assert.ok(h[0]!.inicio < h[1]!.inicio);
});

test("también en letras, sin duplicar el mismo importe", () => {
  const h = importesEnTexto("una carga de doce mil euros");
  assert.deepEqual(h.map((x) => x.valor), [12000]);
});

test("un número sin moneda no es un importe", () => {
  assert.deepEqual(importesEnTexto("finca registral 12345 del Registro n.º 3"), []);
});
