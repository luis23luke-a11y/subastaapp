import assert from "node:assert/strict";
import { test } from "node:test";
import { limpiarReferenciaCatastral, partirDireccion } from "../src/enriquecimiento/direccion";

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

// --- Referencias catastrales escritas a mano --------------------------------

test("una referencia limpia de 20 o 14 caracteres pasa tal cual, en mayusculas", () => {
  assert.equal(limpiarReferenciaCatastral("0001010YH9055N0001MH"), "0001010YH9055N0001MH");
  assert.equal(limpiarReferenciaCatastral("0001010YH9055N"), "0001010YH9055N");
  assert.equal(limpiarReferenciaCatastral("46196A04200361"), "46196A04200361", "parcela rustica");
  assert.equal(limpiarReferenciaCatastral("0001010yh9055n0001mh"), "0001010YH9055N0001MH");
});

test("se quitan puntos, barras, guiones y espacios", () => {
  // Las tres formas vistas en anuncios reales el 26 de octubre de 2026.
  assert.equal(limpiarReferenciaCatastral("0295605QA6609E0001EZ."), "0295605QA6609E0001EZ");
  assert.equal(limpiarReferenciaCatastral("1649914/DF3814H/0021/QO"), "1649914DF3814H0021QO");
  assert.equal(limpiarReferenciaCatastral("1712025-DD7811B-0007-L-Y"), "1712025DD7811B0007LY");
  assert.equal(limpiarReferenciaCatastral("0001010 YH9055N 0001 MH"), "0001010YH9055N0001MH");
});

test("lo que no es una referencia devuelve null en vez de preguntarle al Catastro", () => {
  assert.equal(limpiarReferenciaCatastral("NOCONSTA"), null);
  assert.equal(limpiarReferenciaCatastral("Nocoordinada"), null);
  assert.equal(limpiarReferenciaCatastral("NO"), null);
  assert.equal(limpiarReferenciaCatastral(""), null);
  assert.equal(limpiarReferenciaCatastral(null), null);
  // Un caracter de menos no tiene arreglo: mejor la direccion que una
  // referencia inventada.
  assert.equal(limpiarReferenciaCatastral("0153605DG1005S0001X"), null);
  // Dos referencias pegadas, o una con texto detras, tampoco.
  assert.equal(limpiarReferenciaCatastral("002225200CG90D0001IYPARCELA:22"), null);
  // Solo digitos no es una referencia catastral aunque mida 14: toda
  // referencia lleva letras (la hoja del plano, o el sector en rustica). Lo
  // que trae un anuncio asi suele ser el numero de finca o el IDUFIR.
  assert.equal(limpiarReferenciaCatastral("02004000766025"), null);
});
