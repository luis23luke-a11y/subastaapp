// ---------------------------------------------------------------------------
// Adaptador de muestra. NO son datos reales.
//
// Genera lotes sinteticos con los repartos que medimos sobre el fichero
// abierto Subastas_Judiciales.csv del Ministerio de Justicia (77.491 subastas
// con inmueble, 2021-2026): 64% ejecucion hipotecaria, 8,3% canceladas, y el
// 21% con tasacion que ademas casi siempre repite el importe de salida.
//
// El precio de salida se deriva del valor de mercado del inmueble aplicando un
// descuento, no se sortea por separado: solo asi el margen que calcula la
// interfaz es una cifra con sentido contra la que probar los filtros.
//
// La situacion posesoria y las cargas no estan en ese fichero: esos reparto
// son una suposicion, marcada aqui para que nadie la confunda con un dato.
// ---------------------------------------------------------------------------

import { MUNICIPIOS } from "@/datos/municipios";
import type { Adaptador, BienBruto, LoteBruto, ResultadoDetalle, SubastaBruta } from "@/ingesta/adaptador";
import type { Estado, TipoBien, TipoSubasta } from "@/lib/tipos";

/** Generador congruente lineal: misma semilla, mismos datos. */
function aleatorio(semilla: number) {
  let s = semilla >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

function elegir<T>(r: () => number, pesos: Array<[T, number]>): T {
  const total = pesos.reduce((a, [, p]) => a + p, 0);
  let x = r() * total;
  for (const [v, p] of pesos) {
    x -= p;
    if (x <= 0) return v;
  }
  return pesos[pesos.length - 1]![0];
}

/** Normal estandar por Box-Muller. */
function normal(r: () => number): number {
  const u = Math.max(r(), 1e-9);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r());
}

// Log-normal ajustada a la mediana y al percentil 75 reales.
const MU = Math.log(175_879);
const SIGMA = Math.log(309_000 / 175_879) / 0.6745;

const PROCEDIMIENTOS: Array<[string, number]> = [
  ["Ejecución de bienes hipotecarios y pignorados", 64.3],
  ["Ejecución", 23.9],
  ["Procedimiento sin determinar", 5.2],
  ["Concurso de acreedores", 2.0],
  ["Procedimiento sumario hipotecario", 1.0],
  ["Ejecución de sentencias laborales", 0.7],
  ["Ejecutorias penales", 0.7],
  ["Juicio ordinario", 2.2],
];

const ESTADOS_PESOS: Array<[Estado, number]> = [
  ["celebrandose", 26], ["publicada", 14], ["puja_concluida", 16],
  ["finalizada", 36], ["cancelada", 8],
];

const TIPOS_BIEN_PESOS: Array<[TipoBien, number]> = [
  ["vivienda", 58], ["garaje", 9], ["local", 9], ["suelo", 7],
  ["rustica", 6], ["nave", 4], ["trastero", 3], ["oficina", 2], ["edificio", 2],
];

const JUZGADOS = [
  "Juzgado de Primera Instancia n.º 3",
  "Juzgado de Primera Instancia n.º 7",
  "Juzgado de Primera Instancia e Instrucción n.º 1",
  "Juzgado de lo Social n.º 2",
  "Juzgado de lo Mercantil n.º 1",
  "Dependencia Regional de Recaudación",
];

const VIAS = ["Calle", "Avenida", "Plaza", "Camino", "Paseo"];
const NOMBRES_VIA = [
  "Mayor", "del Mar", "San Roque", "de la Paz", "Nueva", "del Carmen",
  "Colón", "Velázquez", "de la Estación", "Virgen del Pilar", "Sant Jordi",
];

function refCatastral(r: () => number): string {
  const letras = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let s = "";
  for (let i = 0; i < 7; i++) s += Math.floor(r() * 10);
  for (let i = 0; i < 7; i++) s += Math.floor(r() * 10);
  s += letras[Math.floor(r() * letras.length)];
  for (let i = 0; i < 4; i++) s += Math.floor(r() * 10);
  s += letras[Math.floor(r() * letras.length)];
  s += letras[Math.floor(r() * letras.length)];
  return s;
}

// Un anuncio real dice tres cosas: que pasa con las cargas, quien esta dentro,
// y la formula que la ley obliga a incluir. Se componen por separado para que
// el extractor trabaje sobre un texto con la forma que tendra el de verdad.

const FORMULA_LEC =
  "Las cargas y gravámenes anteriores y los preferentes, si los hubiere, al " +
  "crédito del actor continuarán subsistentes, entendiéndose que el rematante " +
  "los acepta y queda subrogado en la responsabilidad de los mismos.";

const FRASES_CARGAS: Array<[string, number]> = [
  ["Según certificación registral, no constan cargas anteriores ni preferentes a la del ejecutante.", 34],
  ["Subsisten las cargas anteriores a la hipoteca ejecutada por importe aproximado de {IMPORTE} euros, que no se cancelarán con la adjudicación.", 18],
  ["Consta embargo anterior a favor de la Agencia Tributaria por importe de {IMPORTE} euros. El adjudicatario se subroga en la carga.", 12],
  ["La finca figura libre de cargas y gravámenes según la nota simple aportada.", 14],
  ["No consta si existen cargas anteriores sobre la finca.", 10],
  ["", 12],
];

const FRASES_POSESION: Array<[string, number]> = [
  ["La finca se encuentra ocupada por el ejecutado y su familia. La posesión no se entrega con la adjudicación.", 24],
  ["No consta en autos la situación posesoria del inmueble.", 28],
  ["El inmueble se encuentra libre de ocupantes.", 20],
  ["El local se encuentra arrendado a un tercero con contrato vigente.", 8],
  ["", 20],
];

const FRASES_HABITUAL: Array<[string, number]> = [
  ["La vivienda constituye el domicilio habitual del ejecutado.", 18],
  ["No constituye la vivienda habitual del deudor.", 12],
  ["", 70],
];

function diasDesde(base: Date, dias: number): string {
  return new Date(base.getTime() + dias * 86_400_000).toISOString();
}

export class AdaptadorMuestra implements Adaptador {
  readonly nombre = "muestra";
  // Generamos en memoria, asi que no hay a quien ser cortes.
  readonly msEntrePeticiones = 0;

  constructor(private readonly cuantas = 240, private readonly semilla = 20261024) {}

  private generar(indice: number): SubastaBruta {
    const r = aleatorio(this.semilla + indice * 7919);
    const hoy = new Date();

    const muni = MUNICIPIOS[Math.floor(r() * MUNICIPIOS.length)]!;
    const tipo = elegir<TipoSubasta>(r, [
      ["judicial", 88], ["aeat", 5], ["concursal", 3], ["seguridad_social", 2], ["notarial", 2],
    ]);
    const estado = elegir(r, ESTADOS_PESOS);
    const tipoBien = elegir(r, TIPOS_BIEN_PESOS);

    const m2 = tipoBien === "garaje" ? 12 + Math.floor(r() * 18)
      : tipoBien === "trastero" ? 4 + Math.floor(r() * 10)
      : tipoBien === "suelo" || tipoBien === "rustica" ? 300 + Math.floor(r() * 6000)
      : tipoBien === "edificio" ? 400 + Math.floor(r() * 900)
      : 55 + Math.floor(r() * 115);

    const construido = tipoBien === "suelo" || tipoBien === "rustica" ? null : m2;
    const eurM2 = Math.round(muni.eurM2 * (0.75 + r() * 0.5));
    const valorEstimado = construido ? Math.round((construido * eurM2) / 500) * 500 : null;

    // El precio de salida se deriva del valor de mercado, no se sortea aparte:
    // en una subasta real las dos cifras estan correlacionadas, y si no lo
    // estan el margen que calcula la interfaz no significa nada.
    //
    // El descuento se centra en el 72% del valor de mercado con mucha
    // dispersion, de modo que alrededor de una cuarta parte de los lotes sale
    // por encima de mercado, que es justo lo que el buscador tiene que ayudar
    // a descartar. Para suelo y rustica, sin valoracion posible, se vuelve a
    // la distribucion nacional medida sobre el fichero de Justicia.
    const descuento = Math.min(Math.max(0.72 + normal(r) * 0.22, 0.25), 1.15);
    const valorSubasta = Math.round(
      (valorEstimado != null
        ? Math.max(valorEstimado * descuento, 5_000)
        : Math.min(Math.max(Math.exp(MU + SIGMA * normal(r)) * 0.45, 6_000), 4_000_000)
      ) / 100,
    ) * 100;

    // El 21% de los registros reales trae tasacion y casi siempre coincide.
    const tasacion = r() < 0.21
      ? (r() < 0.88 ? valorSubasta : Math.round(valorSubasta / (0.6 + r() * 0.3)))
      : null;

    const precisionGeo = r() < 0.62 ? "catastral" : r() < 0.78 ? "portal" : r() < 0.9 ? "via" : "municipio";
    const dispersion = precisionGeo === "municipio" ? 0.02 : 0.012;

    const plantillaCargas = elegir(r, FRASES_CARGAS);
    const importeCarga = Math.round((valorSubasta * (0.05 + r() * 0.35)) / 100) * 100;
    const cargasTexto = [
      plantillaCargas.replace("{IMPORTE}", importeCarga.toLocaleString("es-ES")),
      elegir(r, FRASES_POSESION),
      elegir(r, FRASES_HABITUAL),
      FORMULA_LEC,
    ].filter(Boolean).join(" ");

    const diasACierre = estado === "finalizada" || estado === "cancelada"
      ? -Math.floor(r() * 300) - 1
      : Math.floor(r() * 45) + 1;

    const bien: BienBruto = {
      tipo: tipoBien,
      descripcion: `${tipoBien === "vivienda" ? "Vivienda" : "Inmueble"} en ${muni.nombre}. Datos de muestra, no reales.`,
      direccion: `${VIAS[Math.floor(r() * VIAS.length)]} ${NOMBRES_VIA[Math.floor(r() * NOMBRES_VIA.length)]}, ${1 + Math.floor(r() * 90)}`,
      codigoPostal: String(10_000 + Math.floor(r() * 42_000)).padStart(5, "0"),
      municipio: muni.nombre,
      provincia: muni.provincia,
      comunidad: muni.comunidad,
      referenciaCatastral: r() < 0.72 ? refCatastral(r) : null,
      cuotaPropiedad: r() < 0.14 ? 0.5 : 1,
      inscripcionRegistral: `Finca ${1000 + Math.floor(r() * 60_000)}, Registro de la Propiedad de ${muni.provincia}`,
      enriquecido: {
        lat: muni.lat + (r() - 0.5) * dispersion,
        lon: muni.lon + (r() - 0.5) * dispersion,
        precisionGeo,
        m2Construidos: construido,
        anioConstruccion: construido ? 1955 + Math.floor(r() * 65) : null,
        usoCatastral: tipoBien === "vivienda" ? "Residencial" : null,
        precioM2Zona: construido ? eurM2 : null,
        valorEstimado,
        confianzaValor: construido ? 0.4 + r() * 0.35 : null,
      },
    };

    const lote: LoteBruto = {
      numero: 1,
      valorSubasta,
      valorTasacion: tasacion,
      pujaMinima: valorSubasta,
      deposito: Math.round(valorSubasta * 0.05),
      tramos: Math.max(100, Math.round((valorSubasta * 0.01) / 100) * 100),
      cantidadReclamada: valorSubasta,
      estado,
      cargasTexto,
      // Cargas, situacion posesoria y vivienda habitual NO los rellena el
      // adaptador: salen del texto en normalizar.ts, igual que saldran con una
      // fuente real. Un adaptador solo transmite lo que publica el boletin.
      numPujas: estado === "celebrandose" || estado === "puja_concluida" ? Math.floor(r() * 7) : 0,
      pujaActual: estado === "celebrandose" ? Math.round(valorSubasta * (1 + r() * 0.1)) : null,
      bienes: [bien],
    };

    const anio = 2026;
    return {
      idExterno: `MUESTRA-${anio}-${String(100_000 + indice)}`,
      tipo,
      estado,
      procedimiento: elegir(r, PROCEDIMIENTOS),
      expediente: `${Math.floor(r() * 900) + 100}/20${20 + Math.floor(r() * 6)}`,
      autoridad: `${JUZGADOS[Math.floor(r() * JUZGADOS.length)]} de ${muni.provincia}`,
      fechaPublicacion: diasDesde(hoy, diasACierre - 20 - Math.floor(r() * 30)),
      fechaInicio: diasDesde(hoy, diasACierre - 20),
      fechaFin: diasDesde(hoy, diasACierre),
      url: null,
      lotes: [lote],
    };
  }

  async *descubrir(_desde: Date): AsyncIterable<string> {
    for (let i = 0; i < this.cuantas; i++) yield `MUESTRA-2026-${String(100_000 + i)}`;
  }

  async detalle(idExterno: string): Promise<ResultadoDetalle | null> {
    const m = /^MUESTRA-2026-(\d+)$/.exec(idExterno);
    if (!m) return null;
    const indice = Number.parseInt(m[1]!, 10) - 100_000;
    if (indice < 0 || indice >= this.cuantas) return null;
    const subasta = this.generar(indice);
    // Un adaptador real guardaria aqui el HTML de cada pestaña. Devolvemos el
    // payload generado para que el almacenamiento de crudo se ejerza igual.
    return {
      subasta,
      crudo: [{ etiqueta: "generado", contenido: JSON.stringify(subasta, null, 2), tipoMime: "application/json" }],
    };
  }
}
