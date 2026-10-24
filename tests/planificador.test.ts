import assert from "node:assert/strict";
import { test } from "node:test";
import { esperaReintento, merecePena, planificarRefresco } from "../src/ingesta/planificador";

const AHORA = new Date("2026-10-24T12:00:00Z");
const enHoras = (h: number) => new Date(AHORA.getTime() + h * 3_600_000);
const minutosHasta = (p: { proxima: Date | null }) =>
  p.proxima == null ? null : Math.round((p.proxima.getTime() - AHORA.getTime()) / 60_000);

test("lo que cierra hoy se mira cada poco y adelanta a todo lo demas", () => {
  const hoy = planificarRefresco(enHoras(5), "celebrandose", AHORA);
  const semana = planificarRefresco(enHoras(5 * 24), "celebrandose", AHORA);
  const lejos = planificarRefresco(enHoras(40 * 24), "celebrandose", AHORA);

  assert.equal(minutosHasta(hoy), 15);
  assert.equal(minutosHasta(semana), 360);
  assert.equal(minutosHasta(lejos), 1440);
  assert.ok(hoy.prioridad < semana.prioridad);
  assert.ok(semana.prioridad < lejos.prioridad);
});

test("una subasta cancelada deja de refrescarse", () => {
  assert.equal(planificarRefresco(enHoras(5), "cancelada", AHORA).proxima, null);
  assert.equal(planificarRefresco(enHoras(5), "suspendida", AHORA).proxima, null);
});

test("una recien cerrada se mira una vez mas para recoger el resultado", () => {
  const recien = planificarRefresco(enHoras(-3), "finalizada", AHORA);
  assert.equal(minutosHasta(recien), 360);
  // Pasados dos dias ya no interesa.
  assert.equal(planificarRefresco(enHoras(-72), "finalizada", AHORA).proxima, null);
});

test("sin fecha de cierre se mira una vez al dia, no se abandona", () => {
  assert.equal(minutosHasta(planificarRefresco(null, "publicada", AHORA)), 1440);
});

test("la espera de reintento crece y tiene tope", () => {
  const sinRuido = () => 0.5;
  const e1 = esperaReintento(1, 30_000, 7_200_000, sinRuido);
  const e3 = esperaReintento(3, 30_000, 7_200_000, sinRuido);
  const e20 = esperaReintento(20, 30_000, 7_200_000, sinRuido);
  assert.equal(e1, 30_000);
  assert.equal(e3, 120_000);
  assert.equal(e20, 7_200_000, "tiene que topar, no crecer sin limite");
  assert.ok(e1 < e3);
});

test("el ruido separa los reintentos que fallaron a la vez", () => {
  const bajo = esperaReintento(3, 30_000, 7_200_000, () => 0);
  const alto = esperaReintento(3, 30_000, 7_200_000, () => 1);
  assert.ok(alto > bajo, "dos trabajos no deben volver en el mismo instante");
  assert.ok(bajo >= 120_000 * 0.75 && alto <= 120_000 * 1.25);
});

test("un 404 no se reintenta; una caida de red si", () => {
  assert.equal(merecePena(new Error("HTTP 404 Not Found")), false);
  assert.equal(merecePena(new Error("HTTP 403 Forbidden")), false);
  assert.equal(merecePena(new Error("HTTP 503 Service Unavailable")), true);
  assert.equal(merecePena(new Error("ECONNRESET")), true);
});
