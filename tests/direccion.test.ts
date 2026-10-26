import assert from "node:assert/strict";
import { test } from "node:test";
import {
  limpiarReferenciaCatastral, lugarCatastral, nombreSinArticulo, partirDireccion,
} from "../src/enriquecimiento/direccion";

test("formas habituales de escribir una calle", () => {
  assert.deepEqual(partirDireccion("Calle Mayor, 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("C/ Mayor 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("CL JOSE BARTRINA 49"), { sigla: "CL", nombre: "JOSE BARTRINA", numero: "49" });
  assert.deepEqual(partirDireccion("C/SANABRIA Nº1 1º"), { sigla: "CL", nombre: "SANABRIA", numero: "1" });
  assert.deepEqual(partirDireccion("C. Roger de Llúria 48"), { sigla: "CL", nombre: "ROGER DE LLURIA", numero: "48" });
  assert.deepEqual(partirDireccion("Calle Alcobendas 1."), { sigla: "CL", nombre: "ALCOBENDAS", numero: "1" });
});

test("reconoce las siglas de via mas comunes", () => {
  assert.equal(partirDireccion("Avenida del Puerto, 14")?.sigla, "AV");
  assert.equal(partirDireccion("Avda. del Puerto 14")?.sigla, "AV");
  assert.equal(partirDireccion("AVDA.RONDA NORD 3")?.sigla, "AV");
  assert.equal(partirDireccion("Plaza Mayor 1")?.sigla, "PZ");
  assert.equal(partirDireccion("Pl. Mayor 1")?.sigla, "PZ", "Pl. a mano es plaza");
  assert.equal(partirDireccion("Paseo de Gracia 7")?.sigla, "PS");
  assert.equal(partirDireccion("Camino de la Estación, 62")?.sigla, "CM");
  assert.equal(partirDireccion("Carretera de Valencia 3")?.sigla, "CR");
  assert.deepEqual(partirDireccion("Gran Via 22"), { sigla: "CL", nombre: "GRAN VIA", numero: "22" });
  assert.equal(partirDireccion("Pasaje Fluvia nº 1")?.sigla, "PJ");
  assert.equal(partirDireccion("Partida Llapasa")?.sigla, "PD");
  assert.equal(partirDireccion("Rambla Mestre Torrents 157")?.sigla, "RB");
  assert.equal(partirDireccion("Cuesta de Pedro Gil nº 1")?.sigla, "CT");
  assert.equal(partirDireccion("Polígono Industrial Miraval")?.sigla, "PL", "el Catastro llama PL al poligono");
});

test("los codigos del Catastro escritos en mayusculas pasan tal cual", () => {
  // Comprobado contra el callejero real: PL J-1 P FLAMENCA NORTE (Orihuela),
  // PD SALINETAS (Novelda), DS HIJUELA (Molina de Segura), PQ BODE (Parres).
  assert.deepEqual(partirDireccion("PL J-1 P FLAMENCA NORTE 66 Es:28 Pl:00 Pt:104"), { sigla: "PL", nombre: "J-1 P FLAMENCA NORTE", numero: "66" });
  assert.deepEqual(partirDireccion("PD LA PAÚL Y SAN MIGUEL 0"), { sigla: "PD", nombre: "LA PAUL Y SAN MIGUEL", numero: null });
  assert.equal(partirDireccion("DS HIJUELA 12")?.sigla, "DS");
  assert.equal(partirDireccion("PQ BODE 3")?.sigla, "PQ");
  assert.equal(partirDireccion("TN LOS LLANOS 0")?.sigla, "TN");
  assert.equal(partirDireccion("CJ DEL AGUA 2")?.sigla, "CJ");
  assert.equal(partirDireccion("PT DE PIEDRA 1")?.sigla, "PT");
  assert.equal(partirDireccion("PA AMASADORES PLG 5 PA 502 Y 506")?.sigla, "PA");
  // Un codigo que tambien es palabra no se toma por sigla.
  assert.equal(partirDireccion("EN un edificio de la calle Europa 9")?.sigla, "CL");
});

test("sin sigla se asume calle, que es lo mas probable", () => {
  assert.deepEqual(partirDireccion("Mayor 5"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
});

test("tira piso, puerta y escalera, que el Catastro no quiere ahi", () => {
  assert.deepEqual(partirDireccion("Calle Mayor, 5, 3º B"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("Calle Mayor 5 Esc 2 Planta 3"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("Calle Mayor 5 bajo"), { sigla: "CL", nombre: "MAYOR", numero: "5" });
  assert.deepEqual(partirDireccion("AVDA. DEL MAR, Nº 6, 4º E."), { sigla: "AV", nombre: "DEL MAR", numero: "6" });
  assert.deepEqual(partirDireccion("Calle Alcala, 204 - Piso: 8ª - Puerta: A - CP: 28000"), { sigla: "CL", nombre: "ALCALA", numero: "204" });
});

test("el formato del Catastro: numero y despues planta, puerta o escalera separados por espacios", () => {
  assert.deepEqual(partirDireccion("CL BEBRICIO 33 01 C"), { sigla: "CL", nombre: "BEBRICIO", numero: "33" });
  assert.deepEqual(partirDireccion("AV LAZA DE 82 BJ C"), { sigla: "AV", nombre: "LAZA DE", numero: "82" });
  assert.deepEqual(partirDireccion("AV LAZA DE 82 +1 3"), { sigla: "AV", nombre: "LAZA DE", numero: "82" });
  assert.deepEqual(partirDireccion("AV ANDALUCIA 6 -1 3"), { sigla: "AV", nombre: "ANDALUCIA", numero: "6" });
  assert.deepEqual(partirDireccion("CL SERAPIO MUJICA 3 14 A"), { sigla: "CL", nombre: "SERAPIO MUJICA", numero: "3" });
  assert.deepEqual(partirDireccion("CL GENERAL BENAVENT GARCIA 2 ST 7"), { sigla: "CL", nombre: "GENERAL BENAVENT GARCIA", numero: "2" });
  assert.deepEqual(partirDireccion("AV GARRAF 26(B) Es:1 Pl:01 Pt:01"), { sigla: "AV", nombre: "GARRAF", numero: "26" });
  assert.deepEqual(partirDireccion("CL DR. JOSEP QUERALT 4 Es:P Pl:-2 Pt:20"), { sigla: "CL", nombre: "DR. JOSEP QUERALT", numero: "4" });
  assert.deepEqual(partirDireccion("calle Sur, 2(D)"), { sigla: "CL", nombre: "SUR", numero: "2" });
  assert.deepEqual(partirDireccion("CALLE ASOCIACION 25b, PLANTA BAJA"), { sigla: "CL", nombre: "ASOCIACION", numero: "25" });
  assert.deepEqual(partirDireccion("Doctor Massana, numero 14bis"), { sigla: "CL", nombre: "DOCTOR MASSANA", numero: "14" });
});

test("el 0 del Catastro es sin numero, no el numero 0", () => {
  assert.deepEqual(partirDireccion("CL CHARCO 0"), { sigla: "CL", nombre: "CHARCO", numero: null });
  assert.deepEqual(partirDireccion("UR PLAYA SERENA 0 E"), { sigla: "UR", nombre: "PLAYA SERENA", numero: null });
  assert.deepEqual(partirDireccion("LG LA LAGUNA 0"), { sigla: "LG", nombre: "LA LAGUNA", numero: null });
});

test("s/n y sin numero dejan el numero nulo y cortan lo que sigue", () => {
  assert.deepEqual(partirDireccion("Carretera Riudaura, s/n, bloque letra B"), { sigla: "CR", nombre: "RIUDAURA", numero: null });
  assert.deepEqual(partirDireccion("C/ Nord, s/n, esc A, 1º 2ª"), { sigla: "CL", nombre: "NORD", numero: null });
  assert.deepEqual(partirDireccion("c/francoli s/n-sotano ,Torreforta"), { sigla: "CL", nombre: "FRANCOLI", numero: null });
  assert.deepEqual(partirDireccion("CALLE DOCTOR JUAN REYES SN PLANTA BAJA"), { sigla: "CL", nombre: "DOCTOR JUAN REYES", numero: null });
  assert.deepEqual(partirDireccion("calle Comandante Francisco Almadana, sin número"), { sigla: "CL", nombre: "COMANDANTE FRANCISCO ALMADANA", numero: null });
  assert.deepEqual(partirDireccion("Calle Valls d'Andorra sin numero, portal tres"), { sigla: "CL", nombre: "VALLS D'ANDORRA", numero: null });
  assert.deepEqual(partirDireccion("plazaça joan alsina s/n 1º 2ª"), { sigla: "PZ", nombre: "JOAN ALSINA", numero: null });
});

test("de un rango o una lista de numeros vale el primero", () => {
  assert.equal(partirDireccion("Calle Corrales Bajos, nº 9-11-13-15-17")?.numero, "9");
  assert.equal(partirDireccion("Calle Mayor 62-68")?.numero, "62");
  assert.equal(partirDireccion("calle Doctor Grau Bassas nº 29 y 31")?.numero, "29");
  assert.equal(partirDireccion("CALLE PRIMERO DE ABRIL 2-3 IZQUIERDA")?.numero, "2");
  assert.equal(partirDireccion("Calle Celestino Poza Pastrana Nº2-1ºC,")?.numero, "2");
  assert.equal(partirDireccion("Urbanización GOLF GUADIANA, 6-D, SUELO")?.numero, "6");
});

test("el numero es el primero que sigue al nombre: lo de despues es la unidad", () => {
  assert.deepEqual(partirDireccion("CALLE GUILLEM DE BEZIERS, 1, PLAZA 93"), { sigla: "CL", nombre: "GUILLEM DE BEZIERS", numero: "1" });
  assert.deepEqual(partirDireccion("calle Miguel de Unamuno nº 11-13, plaza de aparcamiento nº 8."), { sigla: "CL", nombre: "MIGUEL DE UNAMUNO", numero: "11" });
  assert.deepEqual(partirDireccion("AVDA. DEL MAR, Nº 6, SÓTANO -2, PLAZA 74"), { sigla: "AV", nombre: "DEL MAR", numero: "6" });
  assert.deepEqual(partirDireccion("Fresser Nº 178, Dpto n.º 6, Segunda planta"), { sigla: "CL", nombre: "FRESSER", numero: "178" });
  assert.deepEqual(partirDireccion("C/ Fernando de la Escosura nº3, Pta 20, 35017 La Montañeta"), { sigla: "CL", nombre: "FERNANDO DE LA ESCOSURA", numero: "3" });
  assert.deepEqual(partirDireccion("Calle Galicia nº22, Torviscas Este, Bungalow C-8, 38660-Adeje"), { sigla: "CL", nombre: "GALICIA", numero: "22" });
});

test("no se inventa un numero que no es un portal", () => {
  // Parcelas, poligonos, apartamentos, kilometros, bloques: el numero que
  // llevan detras no es el de la calle.
  assert.equal(partirDireccion("AVENIDA DEL SOL APARTAMENTO 607")?.numero, null);
  assert.equal(partirDireccion("Poligono 4, parcela 274 Valdeperro")?.numero ?? null, null);
  assert.equal(partirDireccion("Tierra en el término de Charas, Polígono 2, parcela 614")?.numero, null);
  assert.equal(partirDireccion("N II, KM 676 (CAN TORRENT DEL MAS)")?.numero, null);
  assert.equal(partirDireccion("CALLE Janubio, Complejo SUN PARK, Planta Baja, Puerta 807")?.numero, null);
  assert.equal(partirDireccion("CL VIRGEN DE LAS NIEVES, EDIF PRIMAVERA 1 2ºA DCHA")?.numero, null);
  assert.equal(partirDireccion("CALLE SIN NOMBRE- VIVIENDA Nº 18- URBANIZACION EL POZO")?.numero, null);
  assert.equal(partirDireccion("COMPLEJO ACCESO SUR, NAVE 23")?.numero, null);
  assert.equal(partirDireccion("Manzana nº MR-02B del Plan Parcial PP 2.1"), null);
  // Un numero entre parentesis es un inciso, no el portal.
  assert.equal(partirDireccion("AVDA. MILAN (SUELO URBANIZABLE DELIMITADO ULD 14), 1")?.numero, "1");
  // Un ordinal, un codigo postal o un numero con cero delante tampoco.
  assert.equal(partirDireccion("Calle de la Selva, ático, puerta 1ª")?.numero, null);
  assert.equal(partirDireccion("C/ Benissa, 8ª, Escalera 1")?.numero, null);
  assert.equal(partirDireccion("Calle Mayor, 28000 Madrid")?.numero, null);
  assert.equal(partirDireccion("Partida del Bovalar Nº 0172C")?.numero, null);
  // Y un numero sin nombre delante no es una direccion.
  assert.equal(partirDireccion("1"), null);
});

test("un numero al principio es parte del nombre de la calle", () => {
  assert.deepEqual(partirDireccion("CALLE 3, SECTOR S-11, SN, PLANTA S01"), { sigla: "CL", nombre: "3", numero: null });
  assert.deepEqual(partirDireccion("Carrer 11 de Setembre 5"), { sigla: "CL", nombre: "11 DE SETEMBRE", numero: "5" });
});

test("el municipio, el paraje o la esquina repetidos detras no entran en el nombre", () => {
  assert.deepEqual(partirDireccion("AVENIDA DE LUGO, 94, MELIDE (A CORUÑA)"), { sigla: "AV", nombre: "DE LUGO", numero: "94" });
  assert.deepEqual(partirDireccion("c/ de la Cruz. Espinardo"), { sigla: "CL", nombre: "DE LA CRUZ", numero: null });
  assert.deepEqual(partirDireccion("PARTIDA DE ZAFARICH, MONOVAR"), { sigla: "PD", nombre: "DE ZAFARICH", numero: null });
  assert.deepEqual(partirDireccion("CALLE ADELFAS, ESQUINA CALLE DEL AGUA"), { sigla: "CL", nombre: "ADELFAS", numero: null });
  assert.deepEqual(partirDireccion("calle libra esquina calle del chelin"), { sigla: "CL", nombre: "LIBRA", numero: null });
  assert.deepEqual(partirDireccion("CALLE CARLOS V Nº 56 EL CARRIZAL"), { sigla: "CL", nombre: "CARLOS V", numero: "56" });
  assert.deepEqual(partirDireccion("Calle Balmes n1 de Polinya"), { sigla: "CL", nombre: "BALMES", numero: "1" });
});

test("si la calle viene detras de la urbanizacion, se parte desde la calle", () => {
  assert.deepEqual(partirDireccion("Lomas de Torreblanca, C/ Las Dalias 8, bq. 3"), { sigla: "CL", nombre: "LAS DALIAS", numero: "8" });
  assert.deepEqual(partirDireccion("Urbanización laguna Beach (bloque 10),calle Collera nº 14, esc.D"), { sigla: "CL", nombre: "COLLERA", numero: "14" });
});

test("acepta el numero escrito con nº, num., número o n", () => {
  assert.equal(partirDireccion("Calle Mayor nº 5")?.numero, "5");
  assert.equal(partirDireccion("Calle Mayor n.5")?.numero, "5");
  assert.equal(partirDireccion("Calle Mayor Nº5")?.numero, "5");
  assert.equal(partirDireccion("Calle Torrelaguna n º 3")?.numero, "3");
  assert.equal(partirDireccion("Calle Granada, num. 21, 1-1")?.numero, "21");
  assert.equal(partirDireccion("Calle del Diamante, número 41")?.numero, "41");
  assert.equal(partirDireccion("CALLE PABLO IGLESIAS NÙMERO 1 3º,3ª")?.numero, "1");
  assert.deepEqual(partirDireccion("C/ MIGUEL HERNÁNDEZ, Nº 11"), { sigla: "CL", nombre: "MIGUEL HERNANDEZ", numero: "11" });
  assert.deepEqual(partirDireccion("Calle Juan 5"), { sigla: "CL", nombre: "JUAN", numero: "5" }, "la n de Juan no es una marca");
});

test("quita los acentos pero conserva la eñe y la cedilla, como el Catastro", () => {
  // Comprobado el 26 de octubre de 2026: "MUÑOZ SECA" existe en Armilla y
  // "MUNOZ SECA" no; "LLANÇA" existe en Girona y "LLANCA" no; "LLANÇÀ" tampoco.
  assert.equal(partirDireccion("Calle Alcázar 3")?.nombre, "ALCAZAR");
  assert.equal(partirDireccion("Plaza Virgen del Pilar, 52")?.nombre, "VIRGEN DEL PILAR");
  assert.equal(partirDireccion("CL MUÑOZ SECA, 2 1ºC")?.nombre, "MUÑOZ SECA");
  assert.equal(partirDireccion("CALLE SANT GENÍS, 6 LLANÇÀ")?.nombre, "SANT GENIS");
  assert.equal(lugarCatastral("Girona", "Llançà").municipio, "LLANÇA");
});

test("una calle sin numero se devuelve igual, con numero nulo", () => {
  assert.deepEqual(partirDireccion("Calle Mayor"), { sigla: "CL", nombre: "MAYOR", numero: null });
  assert.deepEqual(partirDireccion("CALLE PESET ALEIXANDRE"), { sigla: "CL", nombre: "PESET ALEIXANDRE", numero: null });
});

test("lo que no sirve devuelve null en vez de inventarse algo", () => {
  assert.equal(partirDireccion(null), null);
  assert.equal(partirDireccion(""), null);
  assert.equal(partirDireccion("   "), null);
  assert.equal(partirDireccion("Calle"), null);
  assert.equal(partirDireccion("PISO 2º 1 DE LA CALLE DIAMANTE Nº 65 DE MADRID"), null);
});

test("el articulo inicial se puede quitar para el segundo intento", () => {
  assert.equal(nombreSinArticulo("DE LA CONSTITUCION"), "CONSTITUCION");
  assert.equal(nombreSinArticulo("DEL MAR"), "MAR");
  assert.equal(nombreSinArticulo("DE LOS ARBOLES"), "ARBOLES");
  assert.equal(nombreSinArticulo("D'OLOT"), "OLOT");
  assert.equal(nombreSinArticulo("LA BRASA"), "BRASA");
  assert.equal(nombreSinArticulo("MAYOR"), null);
  assert.equal(nombreSinArticulo("DELICIAS"), null, "DEL solo si es palabra entera");
});

test("provincia y municipio como los nombra el Catastro", () => {
  // Su lista de provincias (ConsultaProvincia, 26 de octubre de 2026) va en
  // mayusculas sin acentos y con nombres propios; "Málaga" devuelve "LA
  // PROVINCIA NO EXISTE" y "SANTA CRUZ DE TENERIFE" tambien.
  assert.deepEqual(lugarCatastral("Málaga", "BENALMADENA"), { provincia: "MALAGA", municipio: "BENALMADENA" });
  assert.deepEqual(lugarCatastral("Alicante/Alacant", "elda"), { provincia: "ALACANT", municipio: "ELDA" });
  assert.deepEqual(lugarCatastral("Castellón/Castelló", "Vila-real"), { provincia: "CASTELLO", municipio: "VILA-REAL" });
  assert.deepEqual(lugarCatastral("Valencia/València", "Valencia"), { provincia: "VALENCIA", municipio: "VALENCIA" });
  assert.deepEqual(lugarCatastral("Santa Cruz de Tenerife", "ADEJE"), { provincia: "S.C. TENERIFE", municipio: "ADEJE" });
  assert.deepEqual(lugarCatastral("Coruña, A", "Melide"), { provincia: "A CORUÑA", municipio: "MELIDE" });
  assert.deepEqual(lugarCatastral("Illes Balears", "Alaró"), { provincia: "ILLES BALEARS", municipio: "ALARO" });
  assert.deepEqual(lugarCatastral("Almería", "MOJÁCAR"), { provincia: "ALMERIA", municipio: "MOJACAR" });
  assert.deepEqual(lugarCatastral("Barcelona", "Vilanova i la Geltrú"), { provincia: "BARCELONA", municipio: "VILANOVA I LA GELTRU" });
});

test("una referencia bien escrita se devuelve en mayusculas", () => {
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
  assert.equal(limpiarReferenciaCatastral("0001010YH9055N0001M"), null, "19 caracteres: falta uno");
  assert.equal(limpiarReferenciaCatastral("12345678901234"), null, "solo digitos");
  assert.equal(limpiarReferenciaCatastral(""), null);
  assert.equal(limpiarReferenciaCatastral(null), null);
});
