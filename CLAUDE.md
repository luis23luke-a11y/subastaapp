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
- Acceso por enlace de un solo uso, buscador con filtros, mapa, ficha de lote.
- Calculadora de coste de adquisición y margen con ITP por comunidad.
- Cliente del Catastro probado contra el servicio real, cadena de geocodificación
  con precisión declarada, extractor de cargas con cita literal por campo.
- 74 pruebas (`npm test`, `node --test`, sin dependencias de testing).

Lo que **no** funciona todavía: la ingesta real. Los datos que se ven son de
muestra, generados por `src/ingesta/adaptadores/muestra.ts`. El README explica
por qué (el Portal del BOE tiene `Disallow: /`) y las cuatro vías posibles.

## Despliegue actual

| Qué | Dónde |
|---|---|
| Producción | https://subastapp-gold.vercel.app |
| Proyecto Vercel | `subastapp` (framework Next.js, Node 24) |
| Base de datos | Neon, `eu-central-1`, PostGIS 3.6, migrada y sembrada |
| Datos sembrados | 240 subastas / lotes / bienes de muestra |

La base tiene **datos de muestra, no reales**. No los enseñes a nadie como si
fueran subastas de verdad.

### Lo primero que hay que hacer

1. **Enlazar este repositorio al proyecto de Vercel.** Está sin enlazar: los
   despliegues se hicieron subiendo los ficheros a mano desde una sesión de chat,
   y solo los 28 que importa la web (el worker, el cliente del Catastro y el
   extractor no están desplegados, porque la web no los importa). Con
   `vercel link` y el repo conectado, cada push despliega solo.
2. **Comprobar que todo sigue verde en local:** `npm install`, `npm test`,
   `npm run tipos`, `npm run db:estado`.

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

**Las migraciones son ficheros numerados en `db/` y son idempotentes.** Para
cambiar el esquema se añade una migración nueva; no se edita una existente, ni se
cambia su número. La vista va la última a propósito.

### Variables de entorno

Copia `.env.example` a `.env`. La cadena de Neon está en Vercel → proyecto
`subastapp` → Settings → Environment Variables; no está en el repo y no debe
estarlo.

Pon **`DB_DRIVER=tcp`** en local. El valor `neon-ws` existe porque el contenedor
donde se construyó esto tenía el puerto 5432 bloqueado y había que conectar por
WebSocket sobre el 443; en una máquina normal estorba.

## Avisos que no son opcionales

**Las teselas del mapa** apuntan por defecto a OpenStreetMap, cuya política de
uso no admite tráfico de producción, y los glifos al servidor de demostración de
MapLibre. Hay que cambiar `NEXT_PUBLIC_TESELAS` y `NEXT_PUBLIC_GLIFOS` por
MapTiler o un Protomaps propio antes de abrir esto a clientes. Los glifos no son
opcionales: un estilo sin ellos no admite capas de texto y MapLibre deja el mapa
en blanco con un error de validación.

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
el adaptador de la fuente real, conectar un modelo de verdad al revisor y medir
su acierto contra las reglas, índices de precios reales, alertas por correo y
Telegram, y pagos.
