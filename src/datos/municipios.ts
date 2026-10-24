// Municipios de muestra con coordenadas aproximadas del centro urbano y un
// precio de referencia por metro construido, para que los datos de prueba
// tengan geografia y valoracion plausibles.
//
// Los precios son de referencia general y NO son una fuente de valoracion:
// cuando entre el enriquecimiento real, salen de los indices del Ministerio de
// Vivienda, el INE y el Colegio de Registradores por codigo postal.

export interface Municipio {
  nombre: string;
  provincia: string;
  comunidad: string;
  lat: number;
  lon: number;
  eurM2: number;
}

export const MUNICIPIOS: Municipio[] = [
  { nombre: "Madrid", provincia: "Madrid", comunidad: "Comunidad de Madrid", lat: 40.4168, lon: -3.7038, eurM2: 4300 },
  { nombre: "Getafe", provincia: "Madrid", comunidad: "Comunidad de Madrid", lat: 40.3083, lon: -3.7325, eurM2: 2500 },
  { nombre: "Alcalá de Henares", provincia: "Madrid", comunidad: "Comunidad de Madrid", lat: 40.4818, lon: -3.3645, eurM2: 2100 },
  { nombre: "Barcelona", provincia: "Barcelona", comunidad: "Cataluña", lat: 41.3874, lon: 2.1686, eurM2: 4500 },
  { nombre: "L'Hospitalet de Llobregat", provincia: "Barcelona", comunidad: "Cataluña", lat: 41.3597, lon: 2.0998, eurM2: 2900 },
  { nombre: "Terrassa", provincia: "Barcelona", comunidad: "Cataluña", lat: 41.5610, lon: 2.0089, eurM2: 2000 },
  { nombre: "Girona", provincia: "Girona", comunidad: "Cataluña", lat: 41.9794, lon: 2.8214, eurM2: 2300 },
  { nombre: "Tarragona", provincia: "Tarragona", comunidad: "Cataluña", lat: 41.1189, lon: 1.2445, eurM2: 1700 },
  { nombre: "Valencia", provincia: "Valencia", comunidad: "Comunidad Valenciana", lat: 39.4699, lon: -0.3763, eurM2: 2600 },
  { nombre: "Castellón de la Plana", provincia: "Castellón", comunidad: "Comunidad Valenciana", lat: 39.9864, lon: -0.0513, eurM2: 1350 },
  { nombre: "Nules", provincia: "Castellón", comunidad: "Comunidad Valenciana", lat: 39.8536, lon: -0.1572, eurM2: 950 },
  { nombre: "Vila-real", provincia: "Castellón", comunidad: "Comunidad Valenciana", lat: 39.9385, lon: -0.1014, eurM2: 1100 },
  { nombre: "Benicàssim", provincia: "Castellón", comunidad: "Comunidad Valenciana", lat: 40.0537, lon: 0.0656, eurM2: 1900 },
  { nombre: "Alicante", provincia: "Alicante", comunidad: "Comunidad Valenciana", lat: 38.3452, lon: -0.4810, eurM2: 1900 },
  { nombre: "Torrevieja", provincia: "Alicante", comunidad: "Comunidad Valenciana", lat: 37.9784, lon: -0.6822, eurM2: 1650 },
  { nombre: "Elche", provincia: "Alicante", comunidad: "Comunidad Valenciana", lat: 38.2699, lon: -0.7126, eurM2: 1250 },
  { nombre: "Sevilla", provincia: "Sevilla", comunidad: "Andalucía", lat: 37.3891, lon: -5.9845, eurM2: 2300 },
  { nombre: "Dos Hermanas", provincia: "Sevilla", comunidad: "Andalucía", lat: 37.2831, lon: -5.9224, eurM2: 1500 },
  { nombre: "Málaga", provincia: "Málaga", comunidad: "Andalucía", lat: 36.7213, lon: -4.4214, eurM2: 2900 },
  { nombre: "Marbella", provincia: "Málaga", comunidad: "Andalucía", lat: 36.5101, lon: -4.8824, eurM2: 3600 },
  { nombre: "Granada", provincia: "Granada", comunidad: "Andalucía", lat: 37.1773, lon: -3.5986, eurM2: 1800 },
  { nombre: "Almería", provincia: "Almería", comunidad: "Andalucía", lat: 36.8381, lon: -2.4597, eurM2: 1400 },
  { nombre: "Jaén", provincia: "Jaén", comunidad: "Andalucía", lat: 37.7796, lon: -3.7849, eurM2: 1100 },
  { nombre: "Córdoba", provincia: "Córdoba", comunidad: "Andalucía", lat: 37.8882, lon: -4.7794, eurM2: 1500 },
  { nombre: "Cádiz", provincia: "Cádiz", comunidad: "Andalucía", lat: 36.5271, lon: -6.2886, eurM2: 2100 },
  { nombre: "Huelva", provincia: "Huelva", comunidad: "Andalucía", lat: 37.2614, lon: -6.9447, eurM2: 1200 },
  { nombre: "Zaragoza", provincia: "Zaragoza", comunidad: "Aragón", lat: 41.6488, lon: -0.8891, eurM2: 1800 },
  { nombre: "Huesca", provincia: "Huesca", comunidad: "Aragón", lat: 42.1362, lon: -0.4087, eurM2: 1400 },
  { nombre: "Bilbao", provincia: "Vizcaya", comunidad: "País Vasco", lat: 43.2630, lon: -2.9350, eurM2: 3300 },
  { nombre: "Vitoria-Gasteiz", provincia: "Álava", comunidad: "País Vasco", lat: 42.8467, lon: -2.6716, eurM2: 2600 },
  { nombre: "San Sebastián", provincia: "Guipúzcoa", comunidad: "País Vasco", lat: 43.3183, lon: -1.9812, eurM2: 5200 },
  { nombre: "A Coruña", provincia: "A Coruña", comunidad: "Galicia", lat: 43.3623, lon: -8.4115, eurM2: 2200 },
  { nombre: "Vigo", provincia: "Pontevedra", comunidad: "Galicia", lat: 42.2406, lon: -8.7207, eurM2: 1900 },
  { nombre: "Ourense", provincia: "Ourense", comunidad: "Galicia", lat: 42.3365, lon: -7.8639, eurM2: 1300 },
  { nombre: "Valladolid", provincia: "Valladolid", comunidad: "Castilla y León", lat: 41.6523, lon: -4.7245, eurM2: 1700 },
  { nombre: "Salamanca", provincia: "Salamanca", comunidad: "Castilla y León", lat: 40.9701, lon: -5.6635, eurM2: 1800 },
  { nombre: "León", provincia: "León", comunidad: "Castilla y León", lat: 42.5987, lon: -5.5671, eurM2: 1300 },
  { nombre: "Burgos", provincia: "Burgos", comunidad: "Castilla y León", lat: 42.3439, lon: -3.6969, eurM2: 1600 },
  { nombre: "Toledo", provincia: "Toledo", comunidad: "Castilla-La Mancha", lat: 39.8628, lon: -4.0273, eurM2: 1300 },
  { nombre: "Albacete", provincia: "Albacete", comunidad: "Castilla-La Mancha", lat: 38.9943, lon: -1.8585, eurM2: 1250 },
  { nombre: "Murcia", provincia: "Murcia", comunidad: "Murcia", lat: 37.9922, lon: -1.1307, eurM2: 1300 },
  { nombre: "Cartagena", provincia: "Murcia", comunidad: "Murcia", lat: 37.6257, lon: -0.9966, eurM2: 1200 },
  { nombre: "Oviedo", provincia: "Asturias", comunidad: "Asturias", lat: 43.3619, lon: -5.8494, eurM2: 1700 },
  { nombre: "Gijón", provincia: "Asturias", comunidad: "Asturias", lat: 43.5322, lon: -5.6611, eurM2: 1600 },
  { nombre: "Santander", provincia: "Cantabria", comunidad: "Cantabria", lat: 43.4623, lon: -3.8100, eurM2: 2300 },
  { nombre: "Pamplona", provincia: "Navarra", comunidad: "Navarra", lat: 42.8125, lon: -1.6458, eurM2: 2400 },
  { nombre: "Logroño", provincia: "La Rioja", comunidad: "La Rioja", lat: 42.4650, lon: -2.4456, eurM2: 1700 },
  { nombre: "Palma", provincia: "Baleares", comunidad: "Baleares", lat: 39.5696, lon: 2.6502, eurM2: 3500 },
  { nombre: "Las Palmas de Gran Canaria", provincia: "Las Palmas", comunidad: "Canarias", lat: 28.1235, lon: -15.4363, eurM2: 2000 },
  { nombre: "Santa Cruz de Tenerife", provincia: "Santa Cruz de Tenerife", comunidad: "Canarias", lat: 28.4636, lon: -16.2518, eurM2: 1900 },
  { nombre: "Badajoz", provincia: "Badajoz", comunidad: "Extremadura", lat: 38.8794, lon: -6.9707, eurM2: 1200 },
  { nombre: "Cáceres", provincia: "Cáceres", comunidad: "Extremadura", lat: 39.4753, lon: -6.3724, eurM2: 1250 },
];
