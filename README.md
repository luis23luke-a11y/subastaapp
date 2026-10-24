# Subastas — esqueleto del buscador

Buscador privado de subastas de inmuebles. Esta es la **fase 1**: todo lo que no
depende de la fuente de datos. La ingesta real está pendiente de decidir (ver
abajo) y se enchufa escribiendo un fichero.

Lo que ya funciona, probado de punta a punta contra Postgres 16 con PostGIS 3.4:

- Esquema completo con PostGIS, índices y vista de búsqueda.
- Acceso por invitación con enlace de un solo uso. Sin registro abierto.
- Buscador con filtros, mapa con agrupación y ficha de lote.
- Calculadora de coste de adquisición y margen, con ITP por comunidad.
- Adaptador de ingesta enchufable y datos de muestra con repartos reales.
- 19 pruebas del motor de costes y del parseo de filtros.

## Arrancar en local

Necesitas Node 22 y un Postgres **con la extensión PostGIS**.

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
| `npm test` | Pruebas de costes y filtros |
| `npm run tipos` | `tsc --noEmit` |
| `npm run db:migrar` | Aplica las migraciones de `db/` |
| `npm run db:semilla` | Da de alta un invitado y siembra datos de muestra |
| `npm run acceso` | Genera un enlace de acceso |
| `npm run ingesta` | Una pasada del worker de ingesta |
| `npm run ingesta -- --cola` | Estado de la cola de trabajo |

## Cómo está montado

```
db/001_esquema.sql        Tablas, tipos, índices
db/002_vistas.sql         v_lote_busqueda: lo que consume el buscador
db/003_ingesta.sql        Cola de trabajo, contenido crudo, ejecuciones
src/lib/costes.ts         Motor de coste y margen (puro, con pruebas)
src/lib/filtros.ts        Filtro -> SQL parametrizado. Nada se interpola
src/lib/consultas.ts      Las consultas del buscador y de la ficha
src/lib/auth.ts           Lista blanca, enlaces de un solo uso, sesiones
src/ingesta/adaptador.ts  La interfaz que implementa cada fuente
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

## La ingesta está pendiente

El Portal de Subastas del BOE tiene `Disallow: /` para todos los agentes y no
hay API ni conjunto de datos oficial. El aviso legal del BOE sí autoriza la
reutilización comercial de sus documentos, pero eso es permiso de uso, no de
acceso automático: son cosas distintas y nadie las ha conciliado por escrito.

El fichero abierto `Subastas_Judiciales.csv` del Ministerio de Justicia (80.384
subastas desde 2021) no sirve para el buscador: no trae provincia, ni dirección,
ni identificador, ni precio de adjudicación. Sirve para estadísticas de mercado
y para nada más.

Vías posibles, por orden de limpieza:

1. Comprobar qué ofrece el propio portal a un usuario registrado (alertas por
   correo, búsquedas guardadas, exportación). Es acceso consentido por diseño.
2. Solicitar autorización a la Agencia Estatal BOE.
3. Un proveedor intermediario que ya venda los datos normalizados.
4. Rastreo respetuoso asumiendo el riesgo de bloqueo.

Por eso la fuente se enchufa en `src/ingesta/adaptadores/`. Para añadir una,
implementa `Adaptador` (`descubrir` y `detalle`), regístrala en
`src/ingesta/ejecutar.ts` y nada más de la aplicación se entera.

**Antes de cobrar al primer cliente:** que un abogado revise la vía elegida, y
un asesor fiscal la tabla de ITP de `src/datos/itp.ts`, que está sin verificar.

## Lo que falta

- Adaptador de la fuente real y worker de descubrimiento, detalle y refresco.
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

Las teselas del mapa apuntan por defecto a OpenStreetMap, cuya política de uso
**no admite tráfico de producción**, y los glifos al servidor de demostración de
MapLibre. Cambia `NEXT_PUBLIC_TESELAS` y `NEXT_PUBLIC_GLIFOS` por MapTiler o un
Protomaps propio antes de abrirlo a clientes. Los glifos no son opcionales: un
estilo sin ellos no admite capas de texto y el mapa se queda en blanco.
