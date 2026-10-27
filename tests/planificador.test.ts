import assert from "node:assert/strict";
import { test } from "node:test";
import { esperaHastaVencimiento } from "../src/ingesta/planificador";
import {
  esperaReintento, fusionarEncolado, intercalar, merecePena, planificarRefresco, repartirLote,
  type FilaEnCola, type PeticionEncolar,
} from "../src/ingesta/planificador";

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

// --- Fusion al encolar (regla de la cola, version pura) ----------------------

const fila = (estado: FilaEnCola["estado"], horas: number, prioridad = 100, intentos = 1): FilaEnCola =>
  ({ estado, prioridad, ejecutarTras: enHoras(horas), intentos });
const peticion = (horas: number, prioridad = 100): PeticionEncolar =>
  ({ prioridad, ejecutarTras: enHoras(horas) });

test("adelantar: una ficha ya bajada no se vuelve a encolar", () => {
  // Lo que paso en produccion: el descubrimiento de cada pasada encolaba los
  // 1.227 detalles, y los hechos volvian a 'pendiente' con su fecha vieja.
  assert.equal(fusionarEncolado(fila("hecho", -3), peticion(0), "adelantar"), null);
});

test("adelantar: un trabajo en marcha no se toca", () => {
  assert.equal(fusionarEncolado(fila("ejecutando", -1), peticion(0), "adelantar"), null);
});

test("adelantar: un trabajo fallido se reintenta de cero", () => {
  const r = fusionarEncolado(fila("fallido", 1, 100, 5), peticion(0), "adelantar");
  assert.ok(r);
  assert.equal(r.estado, "pendiente");
  assert.equal(r.intentos, 0);
  // Gana la fecha mas temprana: el reintento no espera a la espera del fallo.
  assert.deepEqual(r.ejecutarTras, enHoras(0));
});

test("adelantar: un pendiente se queda con lo mas temprano y conserva sus intentos", () => {
  const r = fusionarEncolado(fila("pendiente", 2, 100, 2), peticion(5, 50), "adelantar");
  assert.ok(r);
  assert.deepEqual(r.ejecutarTras, enHoras(2), "la fecha vieja era antes");
  assert.equal(r.prioridad, 50, "la prioridad nueva era mas urgente");
  assert.equal(r.intentos, 2);

  const adelantado = fusionarEncolado(fila("pendiente", 24), peticion(0), "adelantar");
  assert.deepEqual(adelantado?.ejecutarTras, enHoras(0), "una peticion mas temprana adelanta");
});

test("programar: la fecha nueva manda, este como este la fila", () => {
  // Un refresco que se reprograma choca con su propia fila, que esta en
  // 'ejecutando' con la fecha ya pasada. Con least() ganaba la vieja y la
  // subasta se refrescaba una sola vez.
  for (const estado of ["ejecutando", "hecho", "fallido", "pendiente"] as const) {
    const r = fusionarEncolado(fila(estado, -1, 300, 3), peticion(6, 10), "programar");
    assert.ok(r, estado);
    assert.equal(r.estado, "pendiente", estado);
    assert.deepEqual(r.ejecutarTras, enHoras(6), estado);
    assert.equal(r.prioridad, 10, `${estado}: la prioridad nueva manda, aunque sea menos urgente`);
    assert.equal(r.intentos, 0, estado);
  }
  const atrasado = fusionarEncolado(fila("pendiente", 0, 10), peticion(24, 200), "programar");
  assert.deepEqual(atrasado?.ejecutarTras, enHoras(24), "programar tambien puede retrasar");
});

test("sin fila previa, en los dos modos, la fila nueva entra tal cual", () => {
  for (const modo of ["adelantar", "programar"] as const) {
    assert.deepEqual(fusionarEncolado(null, peticion(1, 7), modo),
      { estado: "pendiente", prioridad: 7, ejecutarTras: enHoras(1), intentos: 0 });
  }
});

// --- Reparto del lote entre fichas nuevas, enriquecer y lo urgente ----------

test("con fichas sin bajar, la mitad del lote se reserva para ellas", () => {
  // Lo que paso en produccion el 26 de octubre de 2026: 234 refrescos de
  // subastas que cerraban ese dia, con prioridad 10, se llevaban la pasada
  // entera y las 999 fichas nuevas (prioridad 100) no avanzaban.
  const r = repartirLote(20, { detalle: 999 });
  assert.equal(r.nuevas, 10);
  assert.equal(r.enriquecer, 0);
  assert.equal(r.libres, 10);
  assert.equal(r.nuevas + r.enriquecer + r.libres, 20, "el lote no crece ni mengua");
});

test("con bienes por enriquecer, un cuarto del lote se reserva para ellos", () => {
  // Y lo que paso despues: 1.559 bienes reales con prioridad 400 que no se
  // enriquecian nunca, porque los refrescos (10 a 300) siempre iban antes.
  const r = repartirLote(20, { detalle: 999, enriquecer: 1559 });
  assert.equal(r.nuevas, 10);
  assert.equal(r.enriquecer, 5);
  assert.equal(r.libres, 5, "lo urgente conserva al menos un cuarto del lote");
  assert.equal(r.nuevas + r.enriquecer + r.libres, 20);

  // Cuando ya no quedan fichas por bajar, enriquecer sigue con su cuarto y el
  // resto va por prioridad: no hereda el sitio de las fichas.
  const sinFichas = repartirLote(20, { enriquecer: 1559 });
  assert.deepEqual([sinFichas.nuevas, sinFichas.enriquecer, sinFichas.libres], [0, 5, 15]);
});

test("sin nada que bajar ni enriquecer, el lote entero va por prioridad", () => {
  assert.deepEqual(repartirLote(20, {}).nuevas, 0);
  assert.equal(repartirLote(20, { detalle: 0, enriquecer: 0 }).libres, 20);
});

test("si quedan pocos pendientes, no se reserva mas sitio del que hace falta", () => {
  const r = repartirLote(20, { detalle: 3, enriquecer: 2 });
  assert.equal(r.nuevas, 3);
  assert.equal(r.enriquecer, 2);
  assert.equal(r.libres, 15, "los huecos que sobran vuelven a lo urgente");
});

test("las fracciones redondean y se pueden cambiar", () => {
  // Fichas hacia arriba, enriquecer hacia abajo: en un lote pequeño siempre
  // queda algun hueco para lo urgente.
  assert.deepEqual(repartirLote(5, { detalle: 100, enriquecer: 100 }), {
    ...repartirLote(5, { detalle: 100, enriquecer: 100 }), nuevas: 3, enriquecer: 1, libres: 1,
  });
  assert.equal(repartirLote(20, { detalle: 100 }, { nuevas: 0.25 }).nuevas, 5);
  assert.equal(repartirLote(20, { enriquecer: 100 }, { enriquecer: 0.5 }).enriquecer, 10);
  // Las reservas nunca suman mas que el lote.
  const todo = repartirLote(20, { detalle: 100, enriquecer: 100 }, { nuevas: 1, enriquecer: 1 });
  assert.deepEqual([todo.nuevas, todo.enriquecer, todo.libres], [20, 0, 0]);
  const vacio = repartirLote(0, { detalle: 100, enriquecer: 100 });
  assert.deepEqual([vacio.nuevas, vacio.enriquecer, vacio.libres], [0, 0, 0]);
});

test("el lote se atiende alternando lo urgente, lo nuevo y lo que hay que enriquecer", () => {
  assert.deepEqual(intercalar(["u1", "u2", "u3"], ["n1"]), ["u1", "n1", "u2", "u3"]);
  assert.deepEqual(intercalar(["u1", "u2"], ["n1", "n2"], ["e1"]), ["u1", "n1", "e1", "u2", "n2"]);
  assert.deepEqual(intercalar([], ["n1", "n2"]), ["n1", "n2"]);
  assert.deepEqual(intercalar(["u1"], []), ["u1"]);
  assert.deepEqual(intercalar<string>([], []), []);
  assert.deepEqual(intercalar<string>(), []);
});

test("sin trabajo tomable, la pasada espera al siguiente vencimiento si cabe en el tope", () => {
  const ahora = 1_000_000;
  const limite = ahora + 600_000;
  // Vence en 90 s: se espera eso mas el margen.
  assert.equal(esperaHastaVencimiento(new Date(ahora + 90_000), ahora, limite, 2_000), 92_000);
  // Ya ha vencido (relojes distintos): no se espera nada, se vuelve a mirar.
  assert.equal(esperaHastaVencimiento(new Date(ahora - 5_000), ahora, limite, 2_000), 0);
  // Vence despues del tope: la pasada acaba.
  assert.equal(esperaHastaVencimiento(new Date(ahora + 700_000), ahora, limite), null);
  // No hay nada programado: la pasada acaba.
  assert.equal(esperaHastaVencimiento(null, ahora, limite), null);
});
