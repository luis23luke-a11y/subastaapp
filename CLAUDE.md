# Contexto para Claude Code

Buscador privado de subastas judiciales de inmuebles en España. Producto de pago
y de acceso cerrado por invitación; no hay registro abierto ni prioridad de SEO.

**Lee `README.md` antes de tocar nada.** Es el diario del proyecto: arquitectura,
las decisiones que no conviene deshacer, y las trampas que ya costó descubrir una
vez (la fórmula de la Ley de Enjuiciamiento Civil que aparece en todos los
anuncios, las tres rarezas del SOAP del Catastro, por qué la vista de búsqueda es
la migración 006 y no la 002). Este fichero no repite nada de eso: solo dice cómo
trabajar aquí y en qué punto está la cosa.

## En qué punto estamos

Fase 1 terminada y en producción. Lo que funciona de punta a punta:

- Esquema con PostGIS, cola de ingesta en Postgres, vista de búsqueda.
- Acceso por enlace de un solo uso, buscador con filtros, mapa, ficha de lote
  en un cajón sobre el listado. La interfaz es la de Maqro ES (`DESIGN.md`).
- Calculadora de coste de adquisición y margen con ITP por comunidad.
- Cliente del Catastro probado contra el servicio real, cadena de geocodificación
  con precisión declarada, extractor de cargas con cita literal por campo.
- Adaptador del Portal de Subastas del BOE (`src/ingesta/adaptadores/boe.ts`),
  que lee el portal sin sesión y despacio, probado sobre páginas reales.
- 134 pruebas (`npm test`, `node --test`, sin dependencias de testing).

- Ingesta real en producción desde un cron de GitHub Actions
  (`.github/workflows/ingesta-boe.yml`, cada 15 minutos, tope de 14 minutos
  por pasada). La vista de búsqueda esconde los datos de muestra en cuanto hay
  una subasta real; las filas de muestra siguen en la base.

El README explica la base legal (la licencia de reutilización del BOE permite
el uso comercial con cita) y lo que falta por conciliar (el `robots.txt` del
portal), y en «La ingesta en producción» cómo se configura y se vigila el cron.

## Despliegue actual

| Qué | Dónde |
|---|---|
| Producción | https://subastapp-gold.vercel.app |
| Proyecto Vercel | `subastapp` (framework Next.js, Node 24) |
| Base de datos | Neon, `eu-central-1`, PostGIS 3.6, migrada y sembrada |
| Datos sembrados | 240 subastas / lotes / bienes de muestra, ya ocultos por la vista |
| Cron de ingesta | GitHub Actions, workflow «Ingesta BOE», cada 15 minutos |

La base conserva los **240 registros de muestra** (fuente `muestra`), pero el
buscador no los enseña desde que hay subastas reales. Lo real viene del
Portal de Subastas del BOE, con la cita que exige su licencia.

### Identificadores y entorno

| Qué | Valor |
|---|---|
| Repositorio | `github.com/luis23luke-a11y/subastaapp`, rama `main`, **público** desde el 26/10/2026 para que los minutos de Actions del cron sean gratis (el README explica el cálculo) |
| Proyecto Vercel | `subastapp` · `prj_GC6E1g9SWAQ3ebSjXxwABEzvdJws` |
| Equipo Vercel | `team_ec6AxUehNY0PF3nDFtt69x61` |
| Producción | https://subastapp-gold.vercel.app |

Variables ya puestas en Vercel (los tres entornos): `DATABASE_URL` y el resto del
juego `DATABASE_*` que inyecta la integración de Neon, `URL_BASE` y
`DB_MAX_CONEXIONES=2`. El fondo del mapa no necesita variable: sin
`NEXT_PUBLIC_ESTILO_MAPA` se usa el estilo Liberty de OpenFreeMap, y
`NEXT_PUBLIC_FUENTE_MAPA` vale `Noto Sans Regular` por defecto.

`DB_DRIVER` no está puesta en Vercel y así debe quedarse: sin ella el valor por
defecto es `tcp`, que es el correcto. Solo hace falta ponerla a `neon-ws` en un
entorno que no pueda abrir el puerto 5432.

`RESEND_API_KEY` no está puesta. Sin ella, `npm run acceso` imprime el enlace de
invitación en la consola en vez de enviarlo por correo, que para desarrollo va
mejor.

El cron de ingesta no corre en Vercel sino en GitHub Actions, y lee sus
variables de GitHub → Settings → Secrets and variables → Actions:
`DATABASE_URL` como secreto y `BOE_CONTACTO` (el correo del `User-Agent`)
como variable. El README dice cómo ponerlas con `gh`.

### Estado del traspaso

Cerrado el 24 de octubre de 2026:

1. **Repositorio enlazado a Vercel.** La carpeta está enlazada con `vercel
   link` (deja `.vercel/project.json`, que git ignora) y el repo de GitHub
   conectado al proyecto, así que cada push a `main` despliega solo. Hasta
   entonces los despliegues se habían hecho subiendo los ficheros a mano desde
   una sesión de chat, y solo los 28 que importa la web.
2. **Todo verde en local** con Node 24: `npm test` (74 pruebas), `npm run
   tipos`, `npm run build` y `npm run db:estado` contra Neon.

Para tener la base en local sin copiar nada a mano:

```bash
npx vercel env pull .env --environment=development
```

y añade `DB_DRIVER=tcp` al `.env` resultante.

## Cómo trabajar en este repo

**Todo se nombra en español**: ficheros, funciones, variables, columnas, tipos.
`lote`, `bien_enriquecido`, `calcularCostes`, `esperaReintento`. No lo mezcles.

**TypeScript en estricto con `noUncheckedIndexedAccess`.** Indexar un array
devuelve `T | undefined` y hay que tratarlo. Si algo no compila por esto, el
arreglo es comprobar el valor, no relajar el `tsconfig.json`.

**Nada se interpola en SQL.** `src/lib/filtros.ts` construye consultas con
parámetros posicionales, siempre, incluido el orden. Si añades un filtro, sigue
ese patrón.

**Todo campo extraído lleva la frase literal que lo justifica**, y la ficha la
muestra. Un campo sin cita se queda «sin determinar». El revisor con modelo está
sujeto a la misma regla con más dureza: una cita que no aparece literalmente en
el texto de origen se descarta y el campo no se toca. Esto no es un detalle de
presentación, es lo que separa una herramienta de un oráculo.

**Nada se borra.** Las subastas desaparecen del portal de origen; aquí se quedan.
Cada cambio real deja una fila en `lote_snapshot`, y solo se escribe cuando algo
cambió de verdad (comparando con el último snapshot). Ese histórico es el único
activo que no se puede recuperar a posteriori.

**El dato de la fuente y el calculado viven en tablas distintas.** Lo que dijo el
boletín en `subasta` / `lote` / `bien`; lo que calculamos nosotros en
`bien_enriquecido`. Cambiar el modelo de valoración debe ser borrar esa tabla y
recalcular, sin tocar el origen.

**El estilo vive en `src/app/globals.css` y se explica en `DESIGN.md`.** Los
colores son tokens; Tailwind solo los mapea. Nada de colores sueltos en los
componentes, ni bordes gruesos de color a un lado, ni degradados.

**Las migraciones son ficheros numerados en `db/` y son idempotentes.** Para
cambiar el esquema se añade una migración nueva; no se edita una existente, ni se
cambia su número. La vista va la última a propósito y es la excepción: se
recrea entera cada vez, así que cuando gane una columna se edita `006`.

### Variables de entorno

Copia `.env.example` a `.env`. La cadena de Neon está en Vercel → proyecto
`subastapp` → Settings → Environment Variables; no está en el repo y no debe
estarlo.

Pon **`DB_DRIVER=tcp`** en local. El valor `neon-ws` existe porque el contenedor
donde se construyó esto tenía el puerto 5432 bloqueado y había que conectar por
WebSocket sobre el 443; en una máquina normal estorba.

## Avisos que no son opcionales

**El fondo del mapa** viene de OpenFreeMap, un servicio público sin clave ni
límite de visitas que admite uso comercial, pero sin contrato ni garantía: lo
mantiene una persona con donaciones. Si un día deja de responder, el mapa se
queda en gris hasta cambiar `NEXT_PUBLIC_ESTILO_MAPA` por otro estilo
(MapTiler de pago, o un Protomaps propio, que es la opción seria cuando haya
clientes de pago). El estilo que se ponga tiene que traer `glyphs`: sin ellos
no se admite ninguna capa de texto y MapLibre deja el mapa en blanco con un
error de validación.

**Los anuncios reales llevan datos personales** de deudores y acreedores. La app
va con `robots: noindex` y sin registro abierto justamente por eso. La sanción no
llega por rastrear, llega por publicar.

**Antes de cobrarle al primer cliente** hacen falta dos revisiones humanas: un
abogado para la vía de acceso a los datos que se elija, y un asesor fiscal para
la tabla de ITP de `src/datos/itp.ts`, que está entera sin verificar y usa el
tipo más alto cuando no conoce la comunidad, por prudencia.

**La valoración es provisional.** Ninguna pasa de 0,5 de confianza y la ficha lo
dice. Sustituir `indiceDeZona` por índices reales es un cambio de una función.

## Lo que falta

La lista está al final del `README.md`. Por orden de lo que desbloquea más:
conectar un modelo de verdad al revisor y medir su acierto contra las reglas,
índices de precios reales, alertas por correo y Telegram, y pagos.
