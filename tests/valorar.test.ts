import assert from "node:assert/strict";
import { test } from "node:test";
import { indiceDeZona, valorar } from "../src/enriquecimiento/valorar";

test("el índice encuentra el municipio aunque cambien acentos y mayúsculas", () => {
  assert.ok(indiceDeZona("Castellón de la Plana"));
  assert.ok(indiceDeZona("CASTELLON DE LA PLANA"));
  assert.equal(indiceDeZona("Villa Inventada"), null);
  assert.equal(indiceDeZona(null), null);
});

test("un garaje vale menos por metro que una vivienda en la misma calle", () => {
  const base = { municipio: "Nules", m2Construidos: 100, anioConstruccion: 2000, anioActual: 2026 };
  const vivienda = valorar({ ...base, tipo: "vivienda" })!;
  const garaje = valorar({ ...base, tipo: "garaje" })!;
  const trastero = valorar({ ...base, tipo: "trastero" })!;
  assert.ok(vivienda.precioM2Zona > garaje.precioM2Zona);
  assert.ok(garaje.precioM2Zona > trastero.precioM2Zona);
});

test("la antigüedad descuenta, pero con suelo", () => {
  const base = { municipio: "Valencia", tipo: "vivienda" as const, m2Construidos: 100, anioActual: 2026 };
  const nueva = valorar({ ...base, anioConstruccion: 2024 })!;
  const vieja = valorar({ ...base, anioConstruccion: 1960 })!;
  const antiquisima = valorar({ ...base, anioConstruccion: 1850 })!;
  assert.ok(nueva.valorEstimado > vieja.valorEstimado);
  // El descuento topa en el 25%: un piso de 1850 no vale cero.
  assert.ok(vieja.valorEstimado >= nueva.valorEstimado * 0.7);
  assert.equal(vieja.valorEstimado, antiquisima.valorEstimado, "el tope debe aplicarse igual");
});

test("sin año de construcción valora igual pero lo dice y baja la confianza", () => {
  const base = { municipio: "Valencia", tipo: "vivienda" as const, m2Construidos: 100, anioActual: 2026 };
  const con = valorar({ ...base, anioConstruccion: 2000 })!;
  const sin = valorar({ ...base, anioConstruccion: null })!;
  assert.ok(sin.confianza < con.confianza);
  assert.ok(sin.notas.some((n) => n.includes("antigüedad")));
});

test("suelo y rústica no se valoran por metro construido", () => {
  const base = { municipio: "Valencia", m2Construidos: 2000, anioConstruccion: null, anioActual: 2026 };
  assert.equal(valorar({ ...base, tipo: "suelo" }), null);
  assert.equal(valorar({ ...base, tipo: "rustica" }), null);
});

test("sin superficie no hay valoración; no se inventa una", () => {
  const base = { municipio: "Valencia", tipo: "vivienda" as const, anioConstruccion: 2000, anioActual: 2026 };
  assert.equal(valorar({ ...base, m2Construidos: null }), null);
  assert.equal(valorar({ ...base, m2Construidos: 0 }), null);
});

test("mientras el índice sea provisional, la confianza no pasa de 0,5", () => {
  const v = valorar({ municipio: "Madrid", tipo: "vivienda", m2Construidos: 90,
                      anioConstruccion: 2020, anioActual: 2026 })!;
  assert.ok(v.confianza <= 0.5, "no se debe prometer una precisión que no hay");
  assert.ok(v.notas.some((n) => n.includes("tasación")));
});
