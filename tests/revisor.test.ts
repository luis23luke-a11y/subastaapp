import assert from "node:assert/strict";
import { test } from "node:test";
import { extraerDeTexto } from "../src/enriquecimiento/extraer";
import { revisar, validarRespuesta, type ClienteModelo } from "../src/enriquecimiento/revisor";

const TEXTO = "El inmueble figura en el expediente sin más detalle sobre su estado.";

const modeloQueDice = (respuesta: string): ClienteModelo => ({
  nombre: "doble",
  completar: async () => respuesta,
});

test("una cita que no está en el texto se descarta: es una invención", () => {
  const r = validarRespuesta(
    JSON.stringify({ situacion: "ocupado", confianza: 0.9, situacionEvidencia: "está ocupado por okupas" }),
    TEXTO,
  );
  assert.equal(r?.situacionEvidencia, null, "no se puede citar lo que el anuncio no dice");
});

test("una cita literal del texto sí se acepta", () => {
  const r = validarRespuesta(
    JSON.stringify({ situacion: "desconocido", confianza: 0.8, situacionEvidencia: "sin más detalle sobre su estado" }),
    TEXTO,
  );
  assert.equal(r?.situacionEvidencia, "sin más detalle sobre su estado");
});

test("valores fuera de rango o de tipo se normalizan en vez de propagarse", () => {
  const r = validarRespuesta(
    JSON.stringify({ situacion: "arrasado", confianza: 7, cargasImporte: "mucho", cargasSubsisten: "sí" }),
    TEXTO,
  )!;
  assert.equal(r.situacion, "desconocido");
  assert.equal(r.confianza, 1);
  assert.equal(r.cargasImporte, null);
  assert.equal(r.cargasSubsisten, null);
});

test("una respuesta que no es JSON no rompe nada", () => {
  assert.equal(validarRespuesta("lo siento, no puedo ayudarte con eso", TEXTO), null);
  assert.equal(validarRespuesta("", TEXTO), null);
});

test("si las reglas ya resolvieron, no se llama al modelo", async () => {
  let llamado = false;
  const cliente: ClienteModelo = {
    nombre: "espía",
    completar: async () => { llamado = true; return "{}"; },
  };
  const claro = "No constan cargas anteriores ni preferentes. La finca se encuentra libre de ocupantes.";
  const r = await revisar(extraerDeTexto(claro), claro, cliente);
  assert.equal(llamado, false, "pagar por lo que ya está resuelto es tirar dinero");
  assert.equal(r.origen, "reglas");
});

test("sin modelo configurado se conserva lo de las reglas", async () => {
  const r = await revisar(extraerDeTexto(TEXTO), TEXTO, null);
  assert.equal(r.origen, "reglas");
  assert.ok(r.motivo.includes("Sin modelo"));
});

test("el modelo completa lo que las reglas no supieron, si puede citar", async () => {
  const r = await revisar(
    extraerDeTexto(TEXTO), TEXTO,
    modeloQueDice(JSON.stringify({
      cargasSubsisten: null, situacion: "desconocido", confianza: 0.75,
      situacionEvidencia: "sin más detalle sobre su estado",
    })),
  );
  assert.equal(r.origen, "modelo");
  assert.equal(r.extraccion.situacion.confianza, 0.75);
  assert.ok(r.extraccion.situacion.regla.startsWith("modelo:"));
});

test("el modelo no pisa un campo si no puede citar el texto", async () => {
  const previa = extraerDeTexto(TEXTO);
  const r = await revisar(previa, TEXTO,
    modeloQueDice(JSON.stringify({ situacion: "ocupado", confianza: 0.99, situacionEvidencia: null })));
  assert.equal(r.extraccion.situacion.valor, previa.situacion.valor);
  assert.equal(r.origen, "reglas");
});

test("un modelo que falla no tumba la extracción", async () => {
  const roto: ClienteModelo = {
    nombre: "roto",
    completar: async () => { throw new Error("502 Bad Gateway"); },
  };
  const r = await revisar(extraerDeTexto(TEXTO), TEXTO, roto);
  assert.equal(r.origen, "reglas");
  assert.ok(r.motivo.includes("falló"));
});
