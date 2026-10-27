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
- 101 pruebas: costes, filtros, planificador y cola, extracción de cargas, importes,
  direcciones, valoración, validación del revisor y el adaptador del BOE.

## Arrancar en local

Necesitas Node 22 y un Postgres **con la extensión PostGIS**. Probado contra
Postgres 16 con PostGIS 3.4 en local y contra Neon con PostGIS 3.6.

La vista de búsqueda es la migración **006 a propósito**: toca columnas que
añaden migraciones posteriores a la del esquema base, y numerada antes fallaba
en una base limpia pero no en una ya migrada. Es la peor clase de error, el que
solo aparece cuando despliegas. Y es la única migración que **sí se edita** en
vez de añadir otra: se recrea entera cada vez que se aplica, así que cuando
gane una columna se cambia ahí.

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
| `npm test` | Las 101 pruebas (`node --test`, sin dependencias) |
| `npm run tipos` | `tsc --noEmit` |
| `npm run db:migrar` | Aplica las migraciones de `db/` |
| `npm run db:estado` | Comprueba PostGIS, cuenta filas por tabla y por fuente, y enseña las últimas pasadas del worker |
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

Una subasta no puede estar dos veces en la cola para el mismo tipo de trabajo,
así que encolar algo que ya estaba es fundir la petición con la fila vieja. Hay
**dos modos de encolar**, y la regla es la de `fusionarEncolado` en
`src/ingesta/planificador.ts`, con sus pruebas:

| Si la fila ya existe y está… | `adelantar` (el descubrimiento) | `programar` (un refresco que se reprograma; un bien que toca volver a enriquecer) |
|---|---|---|
| hecha | no se toca | vuelve a pendiente con la fecha nueva |
| en marcha | no se toca | queda pendiente para la fecha nueva; `completar` ya no la cierra |
| pendiente | gana la fecha y la prioridad más tempranas | la fecha y la prioridad nuevas mandan |
| fallida | se reintenta de cero | la fecha y la prioridad nuevas mandan |

La consecuencia que importa: **el descubrimiento no vuelve a bajar una ficha
ya bajada**; de volver a mirarla se ocupa su trabajo `refrescar`, al ritmo de
la tabla de arriba. Antes no era así, y se notó en la segunda pasada real (24
de octubre de 2026): de 53 fichas procesadas, 34 eran las mismas de la primera
pasada, porque el descubrimiento las devolvía a pendiente con su fecha
original, que era la más antigua de la cola. Y un refresco que se reprogramaba
chocaba con su propia fila y se quedaba con la fecha vieja, así que una subasta
recién cerrada se miraba una vez en lugar de cada seis horas durante dos días.

### Una pasada sin trabajo espera, no acaba

Cuando no queda nada tomable pero hay trabajos programados para dentro de
unos minutos (los refrescos se reprograman a sí mismos), la pasada espera
a que venza el más próximo en vez de terminar, siempre dentro de su tope de
tiempo (`esperaHastaVencimiento`, en `planificador.ts`). Con la cola al día,
cada pasada terminaba en segundos y la cadena lanzaba otra a los dos minutos
para no hacer nada: el 27 de octubre de 2026 hubo pasadas a las 17:00, 17:02,
17:04 y 17:06 con cero o cinco trabajos. Ahora una pasada dura lo que dura su
tope, haga mucho o poco, y la siguiente arranca cuando toca.

### Cómo se reparte una pasada

Una pasada de catorce minutos no da para todo, y el orden en que se toma la
cola decide qué avanza. La cola se toma por prioridad, y el refresco de una
subasta que cierra hoy tiene prioridad 10 frente al 100 de una ficha nueva.
Con una subasta que cierra hoy es lo que se quiere; con doscientas, la pasada
entera se va en refrescarlas y las mil fichas que faltan por bajar no avanzan.
Pasó el 26 de octubre de 2026: 36 actualizadas, 0 nuevas y 999 fichas sin
bajar al cabo de una pasada. Y lo mismo, más despacio, con el enriquecimiento:
los trabajos `enriquecer` tienen prioridad 400, la más baja, y como los
refrescos se reprograman a sí mismos sin fin siempre había alguno listo antes;
dos días de pasadas y 1.559 bienes reales sin que ninguno pasara por el
Catastro, con el mapa diciendo «0 lotes localizados». Desde entonces hay tres
reglas, las dos primeras en `src/ingesta/planificador.ts` como funciones puras
con pruebas:

- **Cada lote de trabajos reserva sitio por tipo** (`repartirLote`). El worker
  toma los trabajos de veinte en veinte; mientras haya fichas sin bajar, diez
  de cada veinte son trabajos `detalle`; mientras haya bienes por enriquecer,
  cinco de cada veinte son trabajos `enriquecer`; y el resto va por
  prioridad, sea del tipo que sea. Un hueco reservado que no se llena vuelve a
  lo urgente, y sin nada que bajar ni enriquecer el lote entero va por
  prioridad. Así una pasada nunca se va entera en refrescos mientras quede
  algo por bajar o por localizar, y lo que cierra hoy sigue teniendo al menos
  un cuarto del lote. La reserva de enriquecer es un cuarto y no más porque
  un bien son una a tres consultas al Catastro a 350 ms, mucho menos que una
  ficha (cuatro o cinco páginas del portal a segundo y medio): cinco por lote
  dan varias decenas de bienes por pasada sin quitarle al portal casi tiempo.
  Dentro del lote se alternan lo urgente, lo nuevo y lo que hay que
  enriquecer (`intercalar`), para que si el tiempo se agota a mitad de lote no
  se queden fuera siempre los mismos; los que se quedan fuera vuelven a la
  cola tal cual, sin que cuente como intento.
- **Un refresco cuesta la mitad que una ficha nueva.** De una subasta ya
  bajada solo cambian el estado, las fechas y las pujas, y eso está en dos
  pestañas del portal: la general y la de pujas. El adaptador ofrece un
  `detalleLigero` que pide solo esas dos (frente a las cuatro o cinco de la
  ficha entera), y el worker lo usa para los trabajos `refrescar`. Lo que
  trae se escribe con `refrescarSubasta`, que solo toca el estado, las fechas
  y el snapshot del lote: los bienes, las cargas, los importes y la autoridad
  no se mencionan en esa consulta, así que un refresco no puede pisarlos con
  nulos. El crudo de las dos pestañas se guarda igual. El método es opcional
  en la interfaz: una fuente que no lo ofrezca se refresca con la ficha
  entera, y el adaptador de muestra sigue como estaba.
- **Lo que son muchas filas va en una sentencia.** El descubrimiento encola
  las 1.225 fichas con un `insert … select from unnest` por tanda de 500, en
  vez de una ida y vuelta por ficha; las pestañas crudas de una ficha se
  guardan en un solo insert; y los bienes por enriquecer que cada ficha deja
  en cola, también. Desde el runner de GitHub (Estados Unidos) a Neon
  (Fráncfort) cada ida y vuelta son más de cien milisegundos, y el
  descubrimiento solo gastaba cuatro minutos de cada pasada en encolar.

Y una cuarta, sobre **cómo se alimenta la cola de enriquecer**
(`encolarBienesPendientes`, en `src/enriquecimiento/enriquecer.ts`). La vista
`v_bien_por_enriquecer` dice qué bienes se podrían enriquecer mejor: los que
nunca se han mirado, los que se quedaron en el centro del municipio o sin
localizar, los que no tienen superficie y los que llevan 180 días sin revisar.
Pero «se podría mejorar» no es «hay que volver a intentarlo ya»: un bien cuya
dirección el Catastro no entiende sigue en la vista después de enriquecerlo.
El worker encolaba «los 50 primeros de la vista» tras cada ficha, que eran
siempre los mismos 50, y los otros 1.500 nunca entraban. Ahora una sola
sentencia cruza la vista con la tabla de trabajos y deja fuera lo que ya está
en cola o en marcha y lo que se intentó hace menos de 30 días; primero van los
que nunca se han enriquecido y luego los que llevan más tiempo sin revisar.
Se ejecuta al empezar la pasada y tras cada ficha nueva, y solo para bienes de
la fuente que se está ingiriendo: los de muestra no son direcciones reales.

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

La referencia catastral del anuncio se limpia antes de preguntar
(`limpiarReferenciaCatastral`, en `src/enriquecimiento/direccion.ts`, con
pruebas): de 888 referencias reales, 117 no tenían ni 14 ni 20 caracteres,
con un punto final («0295605QA6609E0001EZ.»), con barras o guiones entre los
bloques («1649914/DF3814H/0021/QO»), con un texto que no es una referencia
(«NOCONSTA», «Nocoordinada», 28 veces) o con un carácter de menos, que no
tiene arreglo. Las dos primeras formas se recuperan quitando lo que no es
letra ni dígito; el resto pasa directamente al intento por dirección en vez de
gastar una petición del Catastro en un error seguro. El dato de origen no se
toca: la limpieza solo decide con qué se pregunta.

Una referencia de parcela de 14 caracteres no tiene superficie propia: devuelve
la lista de inmuebles que contiene. Si solo hay uno, que es el caso de una casa
unifamiliar, se usan sus datos; con varios no se elige ninguno, porque un
edificio de siete pisos no tiene una superficie.

### Qué sale con datos reales

Hasta el 26 de octubre de 2026 el enriquecimiento no había corrido nunca en
producción: los trabajos `enriquecer` tienen la prioridad más baja de la cola
y los refrescos no les dejaban turno («Cómo se reparte una pasada» cuenta el
arreglo). La primera pasada real con turno garantizado (run 40320604689,
desde la rama, 14 minutos) enriqueció 34 bienes además de bajar 79 fichas
nuevas y refrescar 39; 30 eran reales y 4, de muestra, arrastrados de la cola
vieja. Lo que salió de los 30 reales:

| | Bienes | Con superficie | Con año | Valorados |
|---|---|---|---|---|
| `catastral` (referencia del anuncio) | 28 | 28 | 22 | 4 |
| `portal` (dirección consultada al Catastro) | 0 | | | |
| `municipio` (centro del municipio) | 1 | 0 | | 0 |
| `ninguna` | 1 | 0 | | 0 |

Y seis consultas más fallaron con «fetch failed» del Catastro desde el runner
de GitHub; se reintentan solas con espera creciente, y desde entonces el error
dice la causa (reset, timeout, DNS). Cuatro lecturas de esta primera muestra,
pequeña pero ya real:

- **Con referencia catastral, el Catastro acierta siempre.** Las 28 fueron a
  `catastral` con superficie, y la cola tomó primero los bienes con
  referencia porque son los de id más bajo. De los 1.878 bienes reales, 1.056
  traen referencia, así que algo más de la mitad de la base acabará con
  coordenadas exactas sin más trabajo.
- **La valoración casi nunca sale**, 4 de 28, por dos motivos distintos. Nueve
  eran suelo o rústica, que no se valoran por metro construido a propósito
  (seis parcelas agrarias salen con 0 m² de uso «Agrario»). Y el resto son
  pueblos que no están en la tabla de municipios de `src/datos/municipios.ts`
  (Verín, Cerdido, Salem, Castilléjar, Cuéllar…): sin índice de zona,
  `valorar` devuelve null. Hasta que haya índices reales por código postal, la
  valoración solo existirá en las ciudades de esa tabla.
- **Las direcciones son el verdadero cuello de botella**, y esta pasada aún
  no las había puesto a prueba. Se midieron después sobre la base entera:
  el apartado siguiente cuenta qué entendía `partirDireccion` antes, qué
  entiende ahora y qué responde el Catastro. El único `ninguna` de la pasada
  era de esos («UR PLAYA SERENA 0 E», Roquetas de Mar): el 0 se tomaba por
  un número, y no llegó ni al centro del municipio porque Roquetas no está
  en la tabla de municipios.
- **País Vasco y Navarra** salen como `municipio` (Bilbao, «CL LEZEAGA 6»):
  el Catastro estatal no los cubre, como se explica abajo. Son 24 bienes de
  1.878.

`npm run db:estado` enseña este desglose al día, por precisión, con cuántos
bienes siguen pendientes y cuántos esperan en la cola. Al ritmo medido, entre
treinta y cuarenta bienes por pasada mientras queden fichas por bajar y más
cuando no, los 1.848 pendientes tardan unas doce horas de cadena.

### Las direcciones sin referencia, medidas

El 26 de octubre de 2026 había 890 bienes reales sin referencia catastral.
Sus direcciones, tal cual las escribe cada juzgado, pasadas por
`partirDireccion` antes y después de enseñarle el formato del Catastro:

| | Antes | Después |
|---|---|---|
| Salen con número de portal | 416 (13 de ellos con el «0» del Catastro, que no es un número) | 516 |
| Salen sin número | 470 | 316 |
| Se rechazan (no es una dirección de calle) | 4 | 58 |

De los 374 que siguen sin número, 206 no traen ni un dígito («CALLE PESET
ALEIXANDRE», «AVENIDA DE LA BALLESTA», parajes y partidas), 93 dicen «s/n»
y 14 llevan el 0 del Catastro: ahí no hay portal que inventar. Los 58
rechazados son parcelas, manzanas, plazas de garaje y pisos descritos en
prosa («PARCELA SEÑALADA CON EL NÚMERO 15 DEL PLANO DE ADJUDICACIÓN…»,
«Manzana nº MR-02B del Plan Parcial…»), cuyo único número no es el de una
calle. Cuatro direcciones reales y lo que sale de ellas:

| Dirección del anuncio | Antes | Después |
|---|---|---|
| `AVDA. DEL MAR, Nº 6, 4º E.` | sin número (el «4º E.» rompía el patrón) | AV · DEL MAR · 6 |
| `UR PLAYA SERENA 0 E` | sin número, y «0 E» dentro del nombre | UR · PLAYA SERENA · sin número |
| `CALLE GUILLEM DE BEZIERS, 1, PLAZA 93` | número 93 (la plaza de garaje) | CL · GUILLEM DE BEZIERS · 1 |
| `AVENIDA DEL SOL APARTAMENTO 607` | número 607 | AV · DEL SOL · sin número |

Las reglas que lo consiguen están comentadas en
`src/enriquecimiento/direccion.ts` y probadas en `tests/direccion.test.ts`;
la que manda es que el número es el primero que sigue al nombre, y solo si
ninguna palabra anterior («parcela», «bloque», «apartamento», «km», «plaza»)
dice que no es un portal. Lo que viene detrás del número (planta, puerta,
escalera, «Es:1 Pl:01 Pt:01», el municipio repetido) se tira. De un rango
(«9-11-13», «62-68») vale el primero.

Sacar el número es la mitad: la otra mitad es que el Catastro lo encuentre.
Las 253 direcciones distintas con número (516 bienes) se pasaron por la
cadena real de `geocodificar` el mismo día, con la caché del Catastro
guardando cada respuesta:

| Lo que respondió el Catastro | Direcciones | Bienes |
|---|---|---|
| Portal encontrado (`portal`) | 79 | 154 |
| No lo encuentra, pero el municipio está en la tabla (`municipio`) | 32 | 58 |
| No lo encuentra y el municipio tampoco está (`ninguna`) | 140 | 302 |
| Tiempo de espera agotado (se reintenta solo) | 2 | 2 |

Los motivos por los que no lo encuentra, contados sobre las consultas: 70
«la vía no existe» (el nombre del anuncio no es el del Catastro: «AVENIDA
BARCELON», abreviaturas, nombres antiguos), 27 «el municipio no existe»
(abajo), 19 «el número no existe» en esa calle, 12 «ningún inmueble» y 11
de provincias forales. La primera pasada real en producción había dejado 0
bienes en `portal`; con esto, un 30 % de los que traen número llegan.

Tres cosas del Catastro que costó descubrir y que hacían inútil cualquier
número bien sacado:

- **La provincia tiene que ir como la nombra el Catastro.** El portal
  escribe «Málaga», «Alicante/Alacant» o «Santa Cruz de Tenerife», y el
  Catastro responde «LA PROVINCIA NO EXISTE» a las tres: quiere «MALAGA»,
  «ALACANT» y «S.C. TENERIFE». Eran 298 de los 890 bienes, un tercio, que
  no podían llegar a `portal` por mucho que la dirección estuviera bien.
  `lugarCatastral` hace la traducción con su propia lista de provincias.
  Los municipios van en mayúsculas sin acentos («MOJÁCAR» no existe,
  «MOJACAR» sí), pero los bilingües siguen fallando: el Catastro quiere
  «MONOVAR/MONOVER» entero y el anuncio dice «MONOVAR». Resolverlos exige
  preguntarle al Catastro con `ConsultaMunicipio`, que admite nombres
  parciales; está en «Lo que falta».
- **La Ñ y la Ç se conservan; los acentos, no.** «MUÑOZ SECA» existe en
  Armilla y «MUNOZ SECA» no; «LLANÇA» existe y «LLANCA» no, pero «LLANÇÀ»
  tampoco. Antes se quitaba todo.
- **El artículo unas veces sí y otras no.** Benalmádena guarda «DEL MAR»,
  Laguna de Duero guarda «CONSTITUCION» (sin «DE LA») y Villanueva de la
  Concepción «BALLESTA LA». No hay forma de saberlo sin preguntar, así que
  `geocodificar` pregunta con el nombre tal cual y, si el Catastro dice que
  la vía no existe, una segunda vez sin el artículo. Las dos respuestas se
  quedan en la caché.

Cuando el Catastro devuelve varias referencias para un portal (los pisos de
un edificio), se usa la primera: todas comparten parcela y coordenadas, que
es lo que hace falta para el mapa. Elegir el piso exacto exigiría entender
la planta y la puerta del anuncio, que hoy se tiran; la superficie que se
guarda es la de esa primera unidad y puede no ser la del bien.

Los códigos de vía también se comprobaron contra el servicio real, porque
la tabla tenía alguna suposición equivocada: el Catastro llama **PL** al
polígono (no PG), **PD** a la partida, **PJ** al pasaje, **DS** al
diseminado y **PQ** a la parroquia (Asturias). Cuando el juzgado escribe ya
en formato Catastro («PL J-1 P FLAMENCA NORTE 66 Es:28»), el código pasa
tal cual.

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

**En producción** el worker corre desde un cron de GitHub Actions cada 15
minutos (ver «La ingesta en producción»), y la vista de búsqueda esconde los
datos de muestra en cuanto hay datos reales. Lo que queda es mandar una
solicitud a la Agencia Estatal BOE para tener el intento documentado.

**Antes de cobrar al primer cliente:** que un abogado revise lo anterior, y
un asesor fiscal la tabla de ITP de `src/datos/itp.ts`, que está sin verificar.

## La ingesta en producción

El worker corre solo desde un cron de **GitHub Actions**:
`.github/workflows/ingesta-boe.yml` lanza cada 15 minutos

```bash
npm run ingesta -- --adaptador=boe --presupuesto=840
```

Catorce minutos de tope por pasada, y lo que no da tiempo se queda en la cola
de Postgres para la siguiente. Lo medido en producción:

| | 26 de octubre de 2026, por la mañana | Misma tarde, tras «Cómo se reparte una pasada» |
|---|---|---|
| Descubrimiento (1.225 subastas) | unos 6 minutos: encolaba una a una | 7 segundos: una sentencia por tanda de 500 |
| Fichas por pasada | 36 (0 nuevas, 36 actualizadas) | 116 (77 nuevas, 39 actualizadas) |
| Peticiones por refresco | 4 o 5 | 2 |
| Bienes enriquecidos por pasada | 0 (nunca les tocaba el turno) | 34, de 40 intentados |

Cada ficha nueva son cuatro o cinco páginas del portal a segundo y medio,
más las escrituras en la base, que desde el runner de GitHub (Estados Unidos)
a Neon (Fráncfort) tienen su latencia; un refresco, dos páginas. Llenar la
base la primera vez lleva unas 13 pasadas; a partir de ahí
cada pasada refresca lo que el planificador dice que toca mirar, reserva
medio lote para lo que falte por bajar, y el descubrimiento añade solo lo
nuevo.

### Las pasadas van en cadena

El horario de GitHub no vale como único lanzador: medido el 26 de octubre de
2026, con `*/15` disparó dos pasadas en siete horas, y con los minutos
desplazados ninguna en cinco. Por eso **cada pasada lanza la siguiente al
terminar** (último paso del workflow, con el token del propio workflow y
permiso `actions: write`), tras un minuto de respiro para el portal, y el
horario queda solo de respaldo para volver a arrancar la cadena si se corta.
Antes de lanzar la siguiente, la pasada mira si ya hay otra en cola o en
marcha y, si la hay, no lanza nada: así nunca corren dos cadenas a la vez
y el ritmo de peticiones al portal no se dobla. Una prueba desde una rama no
encadena nada, solo las pasadas de `main`. Ojo con eso: la prueba entra en el
mismo grupo de concurrencia, así que la pasada de `main` que la vea en cola
tampoco encadena, y al acabar la prueba la cadena está parada hasta que el
horario de respaldo la rearranque. Tras probar desde una rama, mirar
`gh run list --workflow=ingesta-boe.yml` y, si no hay nada en marcha ni en
cola, lanzar `gh workflow run ingesta-boe.yml --ref main`.

Para parar la ingesta: GitHub → Actions → «Ingesta BOE» → «Disable workflow».
Para volver a arrancarla: habilitarlo y pulsar «Run workflow», o esperar al
siguiente cuarto de hora.

### Por qué GitHub Actions y no Vercel Cron

Se valoraron dos sitios donde colgar el cron:

| | GitHub Actions | Vercel Cron |
|---|---|---|
| Qué ejecuta | El worker tal cual, como proceso Node normal | Una ruta API que habría que escribir |
| Tope de tiempo | El que pongamos (hasta 6 horas) | El de una función: 10 s en el plan gratuito, 300 s en el de pago (más con *fluid compute*) |
| Ritmo mínimo | 5 minutos | Una vez al día en el plan gratuito |
| Qué hay que tocar | Un fichero YAML y un secreto | Una ruta nueva, `vercel.json`, y el plan de pago |
| Dónde se ven los fallos | Pestaña Actions del repositorio, con el log entero | Logs de la función en Vercel |

El worker ya está pensado para esto: tope de tiempo, cola en Postgres,
rescate de trabajos a medias, varios workers sin pisarse. Meterlo dentro de
una función de Vercel es pelearse con el límite de tiempo para nada. GitHub
Actions lo corre como lo correría un `cron` de toda la vida.

Lo que cuesta: un repositorio privado tiene 2.000 minutos de Actions al mes
gratis, y a 96 pasadas al día de hasta 15 minutos salen unos 1.400 minutos
**al día**: el cupo se agota en día y medio y el cron se para solo, sin cobrar
nada pero sin más aviso que un correo. Bajar el ritmo no lo arregla, porque
mantener al día 1.200 subastas exige varias horas de rastreo diarias. Por eso
el repositorio es **público** desde el 26 de octubre de 2026: en los públicos
los minutos son gratis e ilimitados. El código no lleva secretos (la cadena de
la base y el correo de contacto viven en los secretos del repositorio y en
Vercel) y las páginas guardadas en `tests/fixtures/boe/` son las que el
portal enseña a cualquiera sin sesión. Si algún día vuelve a ser privado, el
cron tiene que mudarse a un servidor propio o a un PC encendido a diario.

Tres cosas de GitHub que conviene saber. Los `schedule` **solo se disparan en
la rama por defecto** (`main`), y «Run workflow» solo aparece para workflows
que ya existen en `main`; por eso el workflow también se lanza con un `push`
que toque su propio fichero en cualquier otra rama, que es la forma de probar
un cambio antes de fusionarlo. GitHub puede **retrasar** un cron unos minutos
cuando hay cola; da igual, la siguiente pasada recoge lo pendiente. Y si el
repositorio pasa **60 días sin actividad**, GitHub desactiva los `schedule` y
avisa por correo; un push cualquiera los vuelve a activar.

El bloque `concurrency` del workflow hace que, si una pasada se alarga, la
siguiente espere en vez de arrancar en paralelo. Dos workers no se pisarían
(la cola usa `for update skip locked`), pero doblarían el ritmo de peticiones
al portal, que es lo que no queremos.

### Qué hay que configurar

En GitHub, en **Settings → Secrets and variables → Actions**:

| Nombre | Dónde | Qué es |
|---|---|---|
| `DATABASE_URL` | Secrets | La misma cadena de Neon que usa Vercel (Vercel → `subastapp` → Settings → Environment Variables). |
| `BOE_CONTACTO` | Variables | El correo que va en el `User-Agent` para que el BOE pueda escribir si el ritmo le molesta. |

Desde la terminal, con `gh` autenticado, es lo mismo:

```bash
gh variable set BOE_CONTACTO --body "tu@correo.es"
```

y para el secreto, `gh secret set DATABASE_URL` pegando la cadena cuando la
pida (no la pongas en la línea de comandos: se queda en el historial de la
shell). `BOE_CONTACTO` es una variable y no un secreto a propósito: es un
correo que queremos que se vea, y las variables se leen en los logs. Si falta,
el workflow lo avisa en amarillo y sigue; el adaptador manda el `User-Agent`
sin correo.

Las migraciones **no** las aplica el cron: se aplican a mano con
`npm run db:migrar` apuntando a la base de producción, que es lo que se hizo
con la vista de abajo. Recrear la vista cada 15 minutos sería tomar un bloqueo
exclusivo sobre ella 96 veces al día sin motivo.

### Lanzarlo a mano y ver qué ha pasado

```bash
gh workflow run ingesta-boe.yml                  # una pasada ahora, en main
gh run list --workflow=ingesta-boe.yml           # las últimas pasadas
gh run view --log                                # el log de la última
```

En una rama de trabajo, en cambio, se lanza tocando el fichero del workflow y
haciendo push (ver arriba).

También desde la web: pestaña **Actions → Ingesta BOE → Run workflow**. Y
desde el repo, `npm run db:estado` enseña las subastas por fuente, cuántos
lotes ve el buscador y las cinco últimas pasadas del worker, con su error si
lo hubo.

### Qué pasa con los datos de muestra

La base de producción se sembró con 240 subastas inventadas (fuente
`muestra`) para poder enseñar el buscador antes de tener datos reales. Había
dos formas de retirarlas: borrarlas con un script, o dejar que las consultas
las ignoren. Se eligió lo segundo, y la regla está en la propia vista de
búsqueda (`db/006_vistas.sql`): **la fuente `muestra` solo sale mientras no
exista ninguna subasta de otra fuente**. En cuanto la primera subasta real
entra en la base, el buscador, la ficha, el mapa y el desplegable de
provincias dejan de ver las de muestra, todas a la vez y sin tocar una fila.

Por qué así y no borrando: aquí nada se borra y no merece la pena abrir la
excepción por unos datos que no estorban; borrar en cascada subastas, lotes,
bienes, enriquecidos, snapshots, crudos y trabajos es justo la clase de script
que un día alguien ejecuta contra la base equivocada; y con la base vacía
(en local, o en una base nueva) los datos de muestra siguen sirviendo para
desarrollar sin tener que rastrear nada. El coste es que las 240 filas siguen
contando en `db:estado`, que por eso ahora desglosa por fuente.

## Lo que falta

- La solicitud formal a la Agencia Estatal BOE, para tener el intento
  documentado (la ingesta ya corre sola; ver «La ingesta en producción»).
- Conectar un modelo real al revisor y medir su acierto contra las reglas.
- Índices de precios reales para la valoración, en lugar de la tabla provisional.
- Catastros forales de País Vasco y Navarra.
- El nombre del municipio en la consulta por dirección al Catastro. El
  anuncio dice «MONOVAR», «ALICANTE», «SANTA LUCIA» o «JEREZ FRONTERA» y el
  Catastro solo entiende «MONOVAR/MONOVER», «ALICANTE/ALACANT», «SANTA LUCIA
  DE TIRAJANA» y «JEREZ DE LA FRONTERA»: en la medición del 26 de octubre
  de 2026, 27 de unas 300 consultas por dirección murieron en «EL MUNICIPIO
  NO EXISTE», 12 de ellas de Santa Lucía de Tirajana. Su `ConsultaMunicipio`
  admite nombres parciales y devuelve el oficial; habría que resolverlo una
  vez por municipio en `catastro.ts` y guardarlo en la caché.
- Las 206 direcciones sin ningún dígito y las 93 con «s/n» no tienen
  portal que buscar: su única mejora es la tabla de municipios de abajo,
  para que al menos lleguen a `municipio` y no a `ninguna`.
- Ampliar la tabla de municipios de `src/datos/municipios.ts` (o sustituirla
  por el nomenclátor del INE con centroides): sin ella un pueblo que no está
  no tiene ni centro para el mapa ni índice para la valoración. En la primera
  pasada real, 24 de 28 bienes bien localizados se quedaron sin valoración
  por esto y por ser suelo o rústica.
- Alertas por correo y Telegram, incluidas las cancelaciones.
- Favoritos, informe PDF y pagos.
- Aviso legal, política de privacidad y revisión de RGPD.

## Avisos

Los datos de muestra **no son reales**: los genera
`src/ingesta/adaptadores/muestra.ts` con los repartos medidos sobre el fichero
de Justicia. No los enseñes como si fueran subastas de verdad. En cuanto la
base tiene una subasta de otra fuente, la vista de búsqueda los esconde sola.

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
