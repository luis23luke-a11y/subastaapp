import assert from "node:assert/strict";
import { test } from "node:test";
import { partirDireccion } from "../src/enriquecimiento/direccion";

test("formas habituales de escribir una calle", () => {
  assert.deepEqual(partirDireccion("Calle Mayor, 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("C/ Mayor 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("CL JOSE BARTRINA 49"), { sigla: "CL", nombre: "JOSE BARTRINA", numero: "49" });
});

test("reconoce las siglas de via mas comunes", () => {
  assert.equal(partirDireccion("Avenida del Puerto, 14")?.sigla, "AV");
  assert.equal(partirDireccion("Avda. del Puerto 14")?.sigla, "AV");
  assert.equal(partirDireccion("Plaza Mayor 1")?.sigla, "PZ");
  assert.equal(partirDireccion("Paseo de Gracia 7")?.sigla, "PS");
  assert.equal(partirDireccion("Camino de la Estación, 62")?.sigla, "CM");
  assert.equal(partirDireccion("Carretera de Valencia 3")?.sigla, "CR");
  assert.equal(partirDireccion("Gran Via 22")?.sigla, "GV");
});

test("sin sigla se asume calle, que es lo mas probable", () => {
  assert.deepEqual(partirDireccion("Mayor 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
});

test("tira piso, puerta y escalera, que el Catastro no quiere ahi", () => {
  assert.deepEqual(partirDireccion("Calle Mayor, 5, 3º B"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("Calle Mayor 5 Esc 2 Planta 3"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("Calle Mayor 5 bajo"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
});

test("acepta el numero escrito con nº", () => {
  assert.equal(partirDireccion("Calle Mayor nº 5")?.numero, "5");
  assert.equal(partirDireccion("Calle Mayor n.5")?.numero, "5");
});

test("quita los acentos, que el Catastro busca sin ellos", () => {
  assert.equal(partirDireccion("Calle Alcázar 3")?.nombre, "ALCAZAR");
  assert.equal(partirDireccion("Plaza Virgen del Pilar, 52")?.nombre, "VIRGEN DEL PILAR");
});

test("una calle sin numero se devuelve igual, con numero nulo", () => {
  assert.deepEqual(partirDireccion("Calle Mayor"), { sigla: "CL", nombre: "MAYOR", numero: null });
});

test("lo que no sirve devuelve null en vez de inventarse algo", () => {
  assert.equal(partirDireccion(null), null);
  assert.equal(partirDireccion(""), null);
  assert.equal(partirDireccion("   "), null);
  assert.equal(partirDireccion("Calle"), null);
});
