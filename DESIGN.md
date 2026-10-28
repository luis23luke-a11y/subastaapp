# Sistema visual de Subastas

El mismo sistema que Maqro ES, la otra app de Gorex: las dos se ven de la
misma familia y cualquiera que haya usado una sabe moverse por la otra. Los
tokens y las clases viven en `src/app/globals.css`; Tailwind solo los mapea
(`tailwind.config.ts`) para los retoques de maquetación.

## Tokens

| Qué | Claro | Oscuro |
|---|---|---|
| Fondo de página `--fondo` | `#E9E9EC` | `#0A0A0B` |
| Paneles y filas `--fondo-2` | `#FFFFFF` | `#161619` |
| Superficie hundida `--fondo-3` | `#F4F4F6` | `#1D1D21` |
| Tinta `--tinta` / `--tinta-2` / `--tinta-3` | `#111113` / `#3F3F45` / `#55555C` | `#F4F4F6` / `#C4C4CA` / `#A6A6AD` |
| Líneas `--linea` / `--linea-2` | tinta al 10 % / 20 % | blanco al 10 % / 22 % |
| Acento `--acento` | la tinta | la tinta |
| Naranja de Gorex `--naranja` | `#ED4D03` | igual |
| Estados `--bueno` / `--aviso` / `--malo` | verde, ámbar y rojo apagados | versiones claras |

El modo oscuro sigue a `prefers-color-scheme`; no hay interruptor. El acento es
monocromo a propósito: lo único de color son el naranja de la marca y los tres
estados, que aquí señalan una decisión de compra (ocupado, cargas, margen) y
tienen que verse de un vistazo.

## Tipografía

Figtree variable (400 a 800), alojada en `public/fuentes/` para que ninguna
visita descargue la fuente de Google. Cuerpo a 17 px con interlineado 1,6.
Títulos en 800 con tracking −0,025 em. Las cifras llevan `font-variant-numeric:
tabular-nums` (clase `.cifra`) para que alineen en listas y tablas.

## Formas y profundidad

Paneles con radio de 22 px y sombra larga y suave (`--sombra`); botones y
campos con radio de 16 px; filas de la lista con 14 px; píldoras redondas.
La cabecera y el panel lateral son translúcidos (`backdrop-filter`) sobre el
gris del fondo.

## Piezas

- **Cabecera** `header.top`: marca con isotipo (casa en tinta, puerta naranja),
  línea de estado con la cifra de lotes y la hora de la última actualización, y
  acciones a la derecha.
- **Panel lateral** `.lateral`: los filtros, pegajoso en escritorio y cajón que
  entra por la izquierda en pantallas de menos de 980 px (botón «Filtros»).
- **Fila superior** `.filtros`: búsqueda por texto, provincia y orden. Los
  desplegables envían el formulario al cambiar.
- **Lista** `ol.lista > li.fila`: una fila por lote, nombre y señas a la
  izquierda, etiquetas en el centro y precio y margen a la derecha. La fila con
  cierre en tres días o menos lleva un filo de acento a la izquierda; la cerrada
  va atenuada.
- **Ficha** `FichaLote`: la pantalla de un lote, a página completa dentro de
  un panel. Una sola columna con cabeceras `.ficha-h`: qué es y cuánto vale,
  el mapa de dónde está (`MapaLote`, con halo naranja cuando la posición es
  aproximada), evidencias con su cita literal, datos en `dl.datos`, cada bien
  con la descripción que publicó el juzgado, y la línea de tiempo. Sin
  calculadora: se quitó a petición del dueño.
- **Chips**, **píldoras** y **etiquetas**: casillas con forma de píldora que se
  rellenan de tinta al marcarse; píldoras de estado en los tres tonos.

## Lo que no se hace

Nada de bordes gruesos de color en un lado de las tarjetas, ni degradados, ni
iconos de adorno. Las sombras siempre con desplazamiento y desenfoque. Ningún
dato sin su precisión declarada (localización, valoración, extracción).
