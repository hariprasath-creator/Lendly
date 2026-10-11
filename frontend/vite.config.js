
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // GitHub Pages serves this project under /Lendly/
  base: "/Lendly/",
  plugins: [react()],
});
