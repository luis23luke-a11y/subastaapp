import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        fondo: "rgb(var(--fondo) / <alpha-value>)",
        panel: "rgb(var(--panel) / <alpha-value>)",
        linea: "rgb(var(--linea) / <alpha-value>)",
        texto: "rgb(var(--texto) / <alpha-value>)",
        apagado: "rgb(var(--apagado) / <alpha-value>)",
        acento: "rgb(var(--acento) / <alpha-value>)",
        bueno: "rgb(var(--bueno) / <alpha-value>)",
        aviso: "rgb(var(--aviso) / <alpha-value>)",
        malo: "rgb(var(--malo) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--fuente-sans)", "system-ui", "sans-serif"],
        cifras: ["var(--fuente-cifras)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
} satisfies Config;
