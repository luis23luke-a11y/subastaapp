import assert from "node:assert/strict";
import { test } from "node:test";
import {
  elegirMunicipio, elegirPoblacion, elegirVia, mismaProvincia, mismoMunicipio,
  normalizarNombre, palabraClaveDeVia, palabrasDeVia,
} from "../src/enriquecimiento/coincidir";

test("el articulo pospuesto del Catastro vuelve delante", () => {
  assert.equal(normalizarNombre("SASTRES, DELS"), "DELS SASTRES");
  assert.equal(normalizarNombre("Palmas, Las"), "LAS PALMAS");
  assert.equal(normalizarNombre("Coruña, A"), "A CORUÑA");
  assert.equal(normalizarNombre("Llançà"), "LLANÇA", "la cedilla se queda; el acento no");
});

test("el municipio del anuncio y el oficial del Catastro son el mismo", () => {
  // Lo que responde ConsultaMunicipio el 27 de octubre de 2026.
  assert.equal(elegirMunicipio("CREVILLENTE", ["CREVILLENT", "ELX/ELCHE", "SANTA POLA"]), "CREVILLENT");
  assert.equal(elegirMunicipio("Santa Lucia", ["SANTA LUCIA DE TIRAJANA", "SANTA BRIGIDA", "SAN BARTOLOME DE TIRAJANA"]), "SANTA LUCIA DE TIRAJANA");
  assert.equal(elegirMunicipio("MONOVAR", ["MONOVAR/MONOVER", "MONFORTE DEL CID"]), "MONOVAR/MONOVER", "se devuelve el nombre entero, que es lo que quiere el Catastro");
  assert.equal(elegirMunicipio("Alboraya", ["ALBORAIA/ALBORAYA", "ALBORACHE"]), "ALBORAIA/ALBORAYA");
  assert.equal(elegirMunicipio("Mogente", ["MOIXENT / MOGENTE"]), "MOIXENT / MOGENTE");
  assert.equal(elegirMunicipio("Elche", ["ELX/ELCHE", "ELDA"]), "ELX/ELCHE");
  // El exacto gana al parecido.
  assert.equal(elegirMunicipio("Málaga", ["MALAGA", "MALAGA DEL FRESNO"]), "MALAGA");
  // Ante la duda, ninguno.
  assert.equal(elegirMunicipio("SANTA", ["SANTA LUCIA DE TIRAJANA", "SANTA BRIGIDA"]), null);
  assert.equal(elegirMunicipio("SAN", ["SAN BARTOLOME DE TIRAJANA"]), null, "tres letras no son un nombre");
  assert.equal(elegirMunicipio("VILLANUEVA", ["VILLANUEVA DE LA CAÑADA", "VILLANUEVA DEL PARDILLO"]), null);
  // Sin las palabras vacias son el mismo nombre.
  assert.equal(elegirMunicipio("JEREZ FRONTERA", ["JEREZ DE LA FRONTERA", "JEREZ DE LOS CABALLEROS"]), "JEREZ DE LA FRONTERA");
  assert.equal(elegirMunicipio("PARACUELLOS DEL JARAMA", ["PARACUELLOS DE JARAMA", "PARLA"]), "PARACUELLOS DE JARAMA");
  assert.equal(elegirMunicipio("CUEVAS DE ALMANZORA", ["CUEVAS DEL ALMANZORA"]), "CUEVAS DEL ALMANZORA");
  assert.equal(mismoMunicipio("MALAGA", "MALAGA DEL FRESNO"), true, "solo, sin el exacto delante, si encaja");
  assert.equal(mismoMunicipio("ELDA", "ELCHE"), false);
  // El guion no cuenta, y de un nombre doble con guion vale una mitad.
  assert.equal(elegirMunicipio("VÉLEZ MÁLAGA", ["VELEZ-MALAGA", "VELLE"]), "VELEZ-MALAGA");
  assert.equal(elegirMunicipio("DONOSTIA-SAN SEBASTIAN", ["DONOSTIA/SAN SEBASTIAN"]), "DONOSTIA/SAN SEBASTIAN");
  assert.equal(elegirMunicipio("Vila-real", ["VILA-REAL", "VILAFAMES"]), "VILA-REAL");
  assert.equal(elegirMunicipio("VILASECA", ["VILA-SECA", "VILALLONGA DEL CAMP"]), "VILA-SECA", "con o sin espacio");
  // Formas reales del 27 de octubre de 2026 que CartoCiudad no entendia.
  assert.equal(elegirMunicipio("OROTAVA (LA)", ["LA OROTAVA", "LA GUANCHA"]), "LA OROTAVA");
  assert.equal(elegirMunicipio("Cabo Blanco, Arona", ["ARONA", "ADEJE"]), "ARONA");
  assert.equal(elegirMunicipio("SAN PEDRO DE ALCANTARA ( MARBELLA )", ["MARBELLA", "MIJAS"]), "MARBELLA");
  assert.equal(elegirMunicipio("BENALMADENA COSTA", ["BENALMADENA", "MIJAS"]), "BENALMADENA");
  assert.equal(elegirMunicipio("IBIZA", ["EIVISSA", "SANTA EULARIA DES RIU"]), "EIVISSA");
  assert.equal(elegirMunicipio("PALMA DE MALLORCA", ["PALMA", "PALMANOVA"]), "PALMA");
});

test("las palabras con peso de una via, sin articulos ni preposiciones", () => {
  assert.deepEqual(palabrasDeVia("DE LA CONSTITUCION"), ["CONSTITUCION"]);
  assert.deepEqual(palabrasDeVia("SASTRES, DELS"), ["SASTRES"]);
  assert.deepEqual(palabrasDeVia("PONTE DA PEDRA"), ["PONTE", "PEDRA"]);
  assert.deepEqual(palabrasDeVia("D'ORAN"), ["ORAN"]);
  assert.equal(palabraClaveDeVia("MIGUEL HERNANDEZ"), "HERNANDEZ");
  assert.equal(palabraClaveDeVia("DE LA CRUZ"), "CRUZ");
  assert.equal(palabraClaveDeVia("DE LA"), null);
  assert.equal(palabraClaveDeVia("3"), null, "una cifra no sirve para buscar");
});

test("la via oficial que encaja con la del anuncio", () => {
  // Lo que responde ConsultaVia el 27 de octubre de 2026.
  assert.deepEqual(elegirVia({ sigla: "CL", nombre: "DELS SASTRES" }, [{ tv: "CL", nv: "SASTRES, DELS" }]), { tv: "CL", nv: "SASTRES, DELS" });
  assert.deepEqual(elegirVia({ sigla: "PZ", nombre: "DE LA CONSTITUCION" }, [{ tv: "PZ", nv: "CONSTITUCION" }]), { tv: "PZ", nv: "CONSTITUCION" });
  // Con palabras de mas en la oficial vale, si es la unica.
  assert.deepEqual(elegirVia({ sigla: "CL", nombre: "MIGUEL HERNANDEZ" }, [{ tv: "CL", nv: "POETA MIGUEL HERNANDEZ" }]), { tv: "CL", nv: "POETA MIGUEL HERNANDEZ" });
  // Con palabras distintas no: "ABAD SOLA" no es "ABAT SOLA" aunque lo parezca.
  assert.equal(elegirVia({ sigla: "CL", nombre: "ABAD SOLA" }, [{ tv: "CL", nv: "ABAT SOLA" }]), null);
  // Entre dos que encajan, la del mismo tipo de via; y si no, ninguna.
  assert.deepEqual(elegirVia({ sigla: "PZ", nombre: "CONSTITUCION" }, [{ tv: "CL", nv: "CONSTITUCION" }, { tv: "PZ", nv: "CONSTITUCION" }]), { tv: "PZ", nv: "CONSTITUCION" });
  assert.equal(elegirVia({ sigla: "CL", nombre: "SAN JUAN" }, [{ tv: "CL", nv: "SAN JUAN DE DIOS" }, { tv: "CL", nv: "SAN JUAN BOSCO" }]), null);
  // La exacta gana a la que tiene palabras de mas.
  assert.deepEqual(elegirVia({ sigla: "CL", nombre: "SAN JUAN" }, [{ tv: "CL", nv: "SAN JUAN DE DIOS" }, { tv: "AV", nv: "SAN JUAN" }]), { tv: "AV", nv: "SAN JUAN" });
  assert.equal(elegirVia({ sigla: "CL", nombre: "DE LA" }, [{ tv: "CL", nv: "DE LA" }]), null);
});

test("la provincia escrita de cualquier manera", () => {
  assert.equal(mismaProvincia("Alicante/Alacant", "Alacant/Alicante"), true);
  assert.equal(mismaProvincia("Vizcaya", "Bizkaia"), true);
  assert.equal(mismaProvincia("Coruña, A", "A Coruña"), true);
  assert.equal(mismaProvincia("Santa Cruz de Tenerife", "Santa Cruz de Tenerife"), true);
  assert.equal(mismaProvincia("Málaga", "Guadalajara"), false);
});

test("la poblacion de CartoCiudad que es ese municipio", () => {
  // Candidatos reales de `candidates` el 27 de octubre de 2026.
  const c = (id: string, type: string, muni: string, muniCode: string | null, province: string, poblacion: string | null) =>
    ({ id, type, muni, muniCode, province, poblacion });
  const malaga = [
    c("100020317", "poblacion", "Málaga", "29067", "Málaga", "Málaga"),
    c("800002213", "poblacion", "Málaga del Fresno", "19166", "Guadalajara", "Málaga del Fresno"),
    c("29067", "Municipio", "Málaga", "29067", "Málaga", null),
  ];
  assert.deepEqual(elegirPoblacion("MÁLAGA", "Málaga", malaga), { id: "100020317", type: "poblacion", nombre: "Málaga" }, "el nucleo con el nombre del municipio, antes que el termino");
  const basauri = [
    c("1600010600", "poblacion", "Dima", "48026", "Bizkaia", "Basauri baserria / Caserío Basauri"),
    c("48015", "Municipio", "Basauri", "48015", "Bizkaia", null),
  ];
  assert.deepEqual(elegirPoblacion("BASAURI", "Bizkaia", basauri), { id: "48015", type: "Municipio", nombre: "Basauri" }, "el caserio de otro municipio no vale; el termino si");
  const jerez = [
    c("100020337", "poblacion", "Jerez de la Frontera", "11020", "Cádiz", "Jerez de la Frontera"),
    c("100017427", "poblacion", "Jerez de la Frontera", "11020", "Cádiz", "Aeropuerto de Jerez"),
    c("11020", "Municipio", "Jerez de la Frontera", "11020", "Cádiz", null),
  ];
  assert.equal(elegirPoblacion("JEREZ DE LA FRONTERA", "Cádiz", jerez)?.id, "100020337");
  // Sin nucleo ni termino entre los candidatos, vale el codigo INE que trae
  // una calle o un toponimo del municipio ("Vélez Málaga" devuelve diez
  // cosas y ninguna es el municipio entero).
  const velez = [
    c("100032378", "poblacion", "Málaga", "29067", "Málaga", "La Veleta"),
    c("290940000681", "callejero", "Vélez-Málaga", "29094", "Málaga", "Chilches"),
    c("SEIG_C_129007442", "toponimo", "Vélez-Málaga", "29094", "Málaga", "Vélez-Málaga"),
  ];
  assert.deepEqual(elegirPoblacion("VÉLEZ MÁLAGA", "Málaga", velez), { id: "29094", type: "Municipio", nombre: "Vélez-Málaga" });
  const santaLucia = [
    c("800003713", "poblacion", "Albacete", "02003", "Albacete", "Santa Lucía"),
    c("35022", "Municipio", "Santa Lucía de Tirajana", "35022", "Las Palmas", null),
  ];
  assert.equal(elegirPoblacion("Santa Lucia", "Las Palmas", santaLucia)?.id, "35022");
  assert.equal(elegirPoblacion("Santa Lucia", "Albacete", santaLucia)?.id, "800003713", "en Albacete es la localidad que se llama asi");
  assert.equal(elegirPoblacion("Santa Lucia", "Murcia", santaLucia), null, "y en otra provincia, nada");
  // Una localidad que no es municipio: vale la poblacion que se llama asi.
  const trobajo = [
    c("1", "poblacion", "San Andrés del Rabanedo", "24142", "León", "Trobajo del Camino"),
    c("2", "callejero", "León", "24089", "León", "León"),
  ];
  assert.equal(elegirPoblacion("TROBAJO DEL CAMINO", "León", trobajo)?.id, "1");
  assert.equal(elegirPoblacion("TROBAJO", "León", trobajo), null, "solo con el nombre exacto");
  // "SAN PEDRO DE ALCANTARA ( MARBELLA )": el parentesis dice el municipio,
  // y entre sus candidatos no hay nucleo con su nombre, asi que el termino.
  const sanPedro = [
    c("100020525", "poblacion", "Marbella", "29069", "Málaga", "San Pedro de Alcántara"),
    c("290690001632", "callejero", "Marbella", "29069", "Málaga", "Marbella"),
  ];
  assert.deepEqual(elegirPoblacion("SAN PEDRO DE ALCANTARA ( MARBELLA )", "Málaga", sanPedro), { id: "29069", type: "Municipio", nombre: "Marbella" });
  assert.equal(elegirPoblacion("Crevillente", "Alicante/Alacant", [
    c("1000000122", "poblacion", "Crevillent", "03059", "Alacant/Alicante", "Crevillent"),
  ])?.id, "1000000122");
  // Candidatos de dos municipios distintos que encajan: ninguno.
  assert.equal(elegirPoblacion("VILLANUEVA", "Madrid", [
    c("1", "callejero", "Villanueva de la Cañada", "28176", "Madrid", null),
    c("2", "callejero", "Villanueva del Pardillo", "28177", "Madrid", null),
  ]), null);
});
