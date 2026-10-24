# Subastas — esqueleto del buscador

Buscador privado de subastas de inmuebles. La **fase 1** cubre todo lo que no
depende de la fuente de datos; la **fase 2** empieza con el adaptador del
Portal de Subastas del BOE, que lee el portal despacio y sin sesión (ver abajo).

Lo que ya funciona, probado de punta a punta contra Postgres 16 con PostGIS 3.4:

- Esquema completo con PostGIS, índices y vista de búsqueda.
- Acceso por invitación con enlace de un solo uso. Sin registro abierto.
- Buscador con filtros, mapa con agrupación y ficha de lote.
- Calculadora de coste de adquisición y margen, con ITP por comunidad.
- Adaptador de ingesta enchufable, con uno de muestra y uno real para el
  Portal de Subastas del BOE, probado sobre páginas reales guardadas.
- 95 pruebas: costes, filtros, planificador, extracción de cargas, importes,
  direcciones, valoración, validación del revisor y el adaptador del BOE.

## Arrancar en local

Necesitas Node 22 y un Postgres **con la extensión PostGIS**. Probado contra
Postgres 16 con PostGIS 3.4 en local y contra Neon con PostGIS 3.6.

La vista de búsqueda es la migración **006 a propósito**: toca columnas que
añaden migraciones posteriores a la del esquema base, y numerada antes fallaba
en una base limpia pero no en una ya migrada. Es la peor clase de error, el que
solo aparece cuando despliegas.

Si tu entorno no puede abrir el puerto 5432 —pasa en más sitios de los que uno
espera: contenedores de CI, sandboxes, algunas redes corporativas— pon
`DB_DRIVER=neon-ws` y la conexión va por WebSocket sobre el 443.

```bash
cp .env.example .env          # y rellena DATABASE_URL
npm install
npm run db:migrar             # aplica db/*.sql, es idempotente
npm run db:semilla -- --email=tu@correo.es --lotes=240
npm run dev
```

Para entrar sin configurar el correo:

```bash
npm run acceso -- --email=tu@correo.es
```

Imprime un enlace de acceso que caduca en 20 minutos. Con `RESEND_API_KEY` en el
entorno, el enlace se envía por correo en vez de imprimirse.

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm test` | Las 74 pruebas (`node --test`, sin dependencias) |
| `npm run tipos` | `tsc --noEmit` |
| `npm run db:migrar` | Aplica las migraciones de `db/` |
| `npm run db:estado` | Comprueba PostGIS y cuenta las filas de cada tabla |
| `npm run db:semilla` | Da de alta un invitado y siembra datos de muestra |
| `npm run acceso` | Genera un enlace de acceso |
| `npm run ingesta` | Una pasada del worker de ingesta |
| `npm run ingesta -- --cola` | Estado de la cola de trabajo |
| `npm run ingesta -- --adaptador=boe` | Una pasada del worker contra el Portal de Subastas del BOE |
| `npm run boe:seco` | Lee unas fichas del portal y enseña lo que saca, sin tocar la base |

## Cómo está montado

```
db/001_esquema.sql        Tablas, tipos, índices
db/003_ingesta.sql        Cola de trabajo, contenido crudo, ejecuciones
src/lib/costes.ts         Motor de coste y margen (puro, con pruebas)
src/lib/filtros.ts        Filtro -> SQL parametrizado. Nada se interpola
src/lib/consultas.ts      Las consultas del buscador y de la ficha
src/lib/auth.ts           Lista blanca, enlaces de un solo uso, sesiones
src/ingesta/adaptador.ts  La interfaz que implementa cada fuente
src/ingesta/adaptadores/boe.ts  El Portal de Subastas del BOE, leído sin sesión
src/datos/provincias.ts   Provincia -> comunidad autónoma, para el ITP
src/ingesta/worker.ts     Descubrimiento, detalle y refresco
src/ingesta/planificador.ts  Cada cuánto mirar cada cosa (puro, con pruebas)
src/enriquecimiento/      Catastro, geocodificación, valoración y extracción
src/app/(privado)/        Buscador y ficha, detrás de la puerta de acceso
```

## El worker de ingesta

Una sola cola en Postgres con tres tipos de trabajo:

- **descubrir** pregunta a la fuente qué subastas hay nuevas y encola un detalle por cada una.
- **detalle** baja una subasta, guarda el contenido crudo, la normaliza y programa su primer refresco.
- **refrescar** vuelve a mirarla y se reprograma a sí misma según lo cerca que esté de cerrar.

El ritmo de refresco es lo que evita machacar la fuente y a la vez no llegar tarde:

| Cuánto falta para cerrar | Cada cuánto se mira | Prioridad |
|---|---|---|
| Menos de un día | 15 minutos | 10 |
| Esta semana | 6 horas | 50 |
| Más de una semana | 24 horas | 200 |
| Recién cerrada | 6 horas, dos días | 300 |
| Cancelada o suspendida | nunca más | — |

Cada pasada tiene tope de tiempo, así que se puede lanzar desde un cron cada
pocos minutos: lo que no da tiempo a hacer se queda en la cola. Los trabajos de
un worker que murió a medias vuelven solos a la cola a los 30 minutos. Varios
workers pueden correr a la vez sin pisarse, porque la toma usa `for update skip
locked`. Los fallos se reintentan con espera creciente y con ruido, salvo un 404
o un 403, que no se reintentan nunca.

Dos cosas que parecen detalles y no lo son. El **contenido crudo** se guarda
antes de parsearlo, así que el día que mejoremos la extracción de cargas se
reparsea sin volver a pedir nada al origen. Y un **snapshot** solo se escribe
cuando algo cambia de verdad: con 12.000 subastas refrescadas a diario, escribir
uno por pasada son millones de filas idénticas al año.

### Tres decisiones que conviene no deshacer

**El lote es la unidad, no la subasta.** Una subasta tiene N lotes y un lote
tiene M bienes. Es lo que el usuario busca y por lo que puja. Aplanarlo obliga a
rehacer la ingesta entera.

**El dato de la fuente y el dato calculado viven separados.** Lo que dijo el
boletín está en `subasta`, `lote` y `bien`. Lo que calculamos nosotros —
coordenadas, superficie, valoración — está en `bien_enriquecido`. Cuando cambie
el modelo de valoración se borra esa tabla y se recalcula sin tocar el origen.

**Nada se borra.** Las subastas desaparecen del portal de origen; aquí se
quedan. Cada cambio de estado o de pujas deja una fila en `lote_snapshot`, y ese
histórico es lo único que más adelante permite predecir a qué precio se
adjudican las cosas. Si no se guarda desde el primer día, no se puede recuperar.

## Enriquecimiento con el Catastro

Los servicios de datos no protegidos del Catastro son gratuitos y no piden
registro. El cliente está en `src/enriquecimiento/catastro.ts` y usa tres
consultas: referencia catastral a coordenadas, coordenadas a referencia, y
datos descriptivos de un inmueble (superficie, uso y antigüedad).

Tres cosas costaron encontrarlas y están comentadas en el código para no
volver a descubrirlas:

- Los enlaces HttpGet que anuncia el WSDL **están desactivados** en el
  servidor y devuelven un 400 con una página HTML. Solo funciona SOAP por POST.
- El cuerpo SOAP va *bare*: los parámetros son elementos sueltos dentro del
  Body, sin envolverlos en el nombre de la operación.
- Los parámetros viven en `http://www.catastro.meh.es/`, mientras que el
  SOAPAction usa `http://tempuri.org/...`. Mezclarlos devuelve «EL CAMPO SRS
  ES OBLIGATORIO» aunque el campo esté ahí.

### La cadena de geocodificación

Tres intentos, de más a menos preciso, y siempre se declara de dónde salieron
las coordenadas:

| Intento | Precisión que se guarda |
|---|---|
| Referencia catastral del anuncio | `catastral` |
| Dirección consultada al Catastro | `portal` |
| Centro del municipio | `municipio` |
| Nada aprovechable | `ninguna` |

Un punto en el centro del pueblo pintado como si fuera el portal exacto es
peor que no pintar nada, porque el usuario decide mirando el mapa. Por eso la
ficha y el buscador muestran la precisión, y el mapa colorea distinto los
puntos aproximados.

Una referencia de parcela de 14 caracteres no tiene superficie propia: devuelve
la lista de inmuebles que contiene. Si solo hay uno, que es el caso de una casa
unifamiliar, se usan sus datos; con varios no se elige ninguno, porque un
edificio de siete pisos no tiene una superficie.

### Dos límites que conviene saber

**País Vasco y Navarra no están.** Mantienen sus propios catastros forales. Lo
comprobamos: cinco puntos en Bilbao, Pamplona y San Sebastián devuelven «no hay
referencia disponible», frente a tres y cuatro aciertos de cinco en Zaragoza y
Castellón. Cubrir esas dos comunidades exige integraciones aparte con sus
haciendas forales.

**La valoración es provisional.** `src/enriquecimiento/valorar.ts` usa la tabla
de referencia de `src/datos/municipios.ts`, que no es una fuente seria. Por eso
ninguna valoración pasa de 0,5 de confianza y la ficha lo dice. La fuente real
son los índices del Ministerio de Vivienda, el INE y el Colegio de
Registradores por código postal; sustituirla es cambiar solo la función
`indiceDeZona`.

Todas las respuestas del Catastro se guardan en `catastro_cache` durante 180
días, con el XML original por si mañana sacamos más campos de él. Es un
servicio público y gratuito: la cortesía mínima es no preguntarle dos veces lo
mismo.

## Extracción de cargas y situación posesoria

Las dos cosas que deciden si una subasta interesa —qué cargas subsisten y
quién está dentro— vienen en prosa redactada a mano por cada juzgado. Hay dos
capas para convertirlas en campos:

1. **Reglas deterministas** (`src/enriquecimiento/extraer.ts`). Resuelven la
   mayoría de los anuncios, son gratis, y pueden explicar por qué dijeron lo
   que dijeron.
2. **Modelo de lenguaje** (`src/enriquecimiento/revisor.ts`), solo para lo que
   queda por debajo del umbral de confianza. El orden importa: al revés sería
   caro y, peor, imposible de depurar.

### La trampa que invalida un extractor ingenuo

La Ley de Enjuiciamiento Civil obliga a incluir en **todos** los anuncios la
fórmula de que «las cargas y gravámenes anteriores y los preferentes, **si los
hubiere**, continuarán subsistentes». Aparece haya cargas o no.

Un extractor que busque «subsistentes» marca el catálogo entero como peligroso
y deja el filtro inservible. Aquí esa frase se reconoce como fórmula de estilo
y **no cuenta como prueba de nada**: el lote queda «sin determinar», que es la
verdad. Hay una prueba que lo vigila.

La otra distinción que importa: las cargas **anteriores** subsisten tras la
adjudicación, las **posteriores** se cancelan. Solo las primeras son un coste.

### Cada campo lleva su cita

Todo campo extraído guarda la frase literal del anuncio que lo justifica, y la
ficha la muestra debajo del valor. Sin la cita delante, el usuario solo puede
creerse lo que le decimos; con ella, decide él. Es la diferencia entre una
herramienta y un oráculo.

El modelo está sujeto a la misma regla, y con más dureza: **una cita que no
aparece literalmente en el texto se descarta y el campo no se toca**. Un modelo
que afirma sin poder citar no pisa lo que dijeron las reglas.

### Lo que no está probado

El revisor con modelo tiene su interfaz, su validación y sus pruebas con un
doble, pero **no se ha ejecutado contra un modelo real** porque no había clave
de API. Enchufa un `ClienteModelo` y pruébalo antes de confiar en esa capa.

## La ingesta: el Portal de Subastas del BOE

Todas las subastas judiciales, notariales y de Hacienda se publican en un solo
sitio, subastas.boe.es. No hay API ni descarga: la API de datos abiertos del
BOE cubre legislación y sumarios, y el fichero abierto del Ministerio de
Justicia (`Subastas_Judiciales.csv`) no trae provincia, dirección ni
identificador, así que solo sirve para estadística.

**La base legal.** El aviso legal del BOE, con la licencia aprobada por
resolución de 27 de junio de 2024, autoriza la reutilización de sus documentos
con fines comerciales, incluida «la extracción, reordenación y combinación de
la información» para crear productos de valor añadido. A cambio pide la cita
«Basado en datos de la Agencia Estatal Boletín Oficial del Estado» con enlace a
boe.es, no insinuar que el BOE apoya el producto y respetar el RGPD. La ficha y
el buscador llevan esa cita (`src/components/CitaBOE.tsx`). Lo que la licencia
no resuelve es el **cómo**: el `robots.txt` del portal pide a los programas
que no entren. Es la práctica de todo el sector (hay al menos ocho productos
que viven de estos datos y los sacan igual), pero eso es lo que un abogado
tiene que conciliar antes de cobrar al primer cliente.

**Cómo lee el portal** (`src/ingesta/adaptadores/boe.ts`). Como lo leería una
persona: una búsqueda por estado para descubrir y las pestañas de cada ficha
para el detalle, a una petición cada segundo y medio, sin sesión y con un
`User-Agent` que dice quién es (pon un correo en `BOE_CONTACTO` para que
puedan escribir). Con unas 900 subastas de inmuebles abiertas, una pasada
completa son unas 4.000 peticiones repartidas en el día. Lo que costó
descubrir está comentado en el fichero; lo esencial:

- Sin sesión solo se pueden buscar **tres estados**: próxima apertura,
  celebrándose y suspendida. Concluidas y canceladas devuelven cero resultados
  aunque existan. Una subasta «desaparece» del descubrimiento al concluir, pero
  su ficha sigue y lo dice en la cabecera; cuando el portal la retira del todo,
  la ficha responde «no existe» y el worker deja de refrescarla sin borrar nada.
- La ficha **no tiene campo de estado**. Se deduce de las frases de la
  cabecera y, si no hay, de las fechas. El listado sí lo dice, y el adaptador
  lo recuerda. El número de expediente también está solo en el listado.
- Las **pujas nunca son visibles** sin sesión: el portal solo dice si ha
  recibido alguna. `num_pujas` vale 0, 1 (al menos una) o null (secreta).
- Con varios lotes, cada lote es una petición aparte y los importes van en su
  propia tabla.
- Cargas, situación posesoria y vivienda habitual vienen como **campos
  estructurados** en la pestaña de bienes. Cuando son un dato (la Agencia
  Tributaria publica las cargas como importe, y «0,00 €» es que no hay) mandan
  sobre la extracción. Cuando son prosa, pasan al extractor con su etiqueta
  delante, y la ficha cita la frase literal. La fórmula de estilo del Servicio
  de Subastas de Murcia («se mantendrán las cargas o gravámenes anteriores o
  del mismo rango») se reconoce como tal y no cuenta como prueba de cargas.

Para mirar qué sale antes de encolar nada:

```bash
npm run boe:seco -- --cuantas=5
```

Las pruebas del adaptador corren sobre páginas reales guardadas en
`tests/fixtures/boe/` (24 de octubre de 2026). Si el portal cambia el HTML,
lo primero es volver a guardar esas páginas y ver qué prueba se rompe.

**Lo que queda por decidir:** la base de producción sigue con los datos de
muestra. Pasar a datos reales es borrar la semilla y dejar el worker corriendo
desde un cron con `--adaptador=boe`. Y conviene mandar igualmente una
solicitud a la Agencia Estatal BOE para tener el intento documentado.

**Antes de cobrar al primer cliente:** que un abogado revise lo anterior, y
un asesor fiscal la tabla de ITP de `src/datos/itp.ts`, que está sin verificar.

## Lo que falta

- Sustituir los datos de muestra de producción por la ingesta real del BOE
  desde un cron, y la solicitud formal a la Agencia Estatal BOE.
- Conectar un modelo real al revisor y medir su acierto contra las reglas.
- Índices de precios reales para la valoración, en lugar de la tabla provisional.
- Catastros forales de País Vasco y Navarra.
- Alertas por correo y Telegram, incluidas las cancelaciones.
- Favoritos, informe PDF y pagos.
- Aviso legal, política de privacidad y revisión de RGPD.

## Avisos

Los datos de muestra **no son reales**: los genera
`src/ingesta/adaptadores/muestra.ts` con los repartos medidos sobre el fichero
de Justicia. No los enseñes como si fueran subastas de verdad.

Los anuncios reales contienen datos personales de deudores y acreedores. La
aplicación va con `robots: noindex` y sin registro abierto justamente por eso:
la sanción no llega por rastrear, llega por publicar.

El fondo del mapa es el estilo Liberty de OpenFreeMap: público, sin clave, sin
límite de visitas y con uso comercial permitido. A cambio no hay contrato ni
garantía, porque lo mantiene una persona con donaciones. Si deja de responder,
el mapa se queda en gris hasta poner otro estilo en `NEXT_PUBLIC_ESTILO_MAPA`:
MapTiler de pago, o un Protomaps propio alojado en un almacenamiento barato,
que es la opción seria cuando haya clientes de pago. Cualquier estilo que se
ponga tiene que traer `glyphs`; sin ellos no se admite ninguna capa de texto y
el mapa se queda en blanco.

MapLibre, desde la versión 6, arranca su *worker* desde un fichero aparte cuya
URL calcula con `import.meta.url`. Bajo webpack esa URL no lleva a ningún
sitio: el mapa pinta las teselas pero ni un solo punto, y la consola dice
«Worker failed to load». Por eso `scripts/worker-mapa.ts` copia el fichero a
`public/mapa/` antes de `dev` y de `build`, y `Mapa.tsx` se lo indica con
`setWorkerUrl`. Esa copia no va en git.
