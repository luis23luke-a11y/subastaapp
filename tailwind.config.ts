import type { Config } from "tailwindcss";

// Los colores son los tokens de globals.css (sistema DecaLine, el de Maqro ES).
// Se mapean tal cual, sin modificador de opacidad: la transparencia que hace
// falta ya viene decidida en los propios tokens (--linea, --cristal, --*-suave).
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: "var(--fondo)",
        fondo2: "var(--fondo-2)",
        fondo3: "var(--fondo-3)",
        tinta: "var(--tinta)",
        tinta2: "var(--tinta-2)",
        tinta3: "var(--tinta-3)",
        linea: "var(--linea)",
        linea2: "var(--linea-2)",
        acento: "var(--acento)",
        sobreacento: "var(--sobre-acento)",
        naranja: "var(--naranja)",
        bueno: "var(--bueno)",
        aviso: "var(--aviso)",
        malo: "var(--malo)",
        // Nombres antiguos, para que ningun sitio se quede sin color.
        panel: "var(--fondo-2)",
        texto: "var(--tinta)",
        apagado: "var(--tinta-3)",
      },
      borderRadius: {
        panel: "var(--radio)",
        boton: "var(--radio-boton)",
        fila: "14px",
      },
      boxShadow: {
        panel: "var(--sombra)",
        boton: "var(--sombra-boton)",
      },
      fontFamily: {
        sans: ["var(--f)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
