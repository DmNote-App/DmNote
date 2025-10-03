import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import svgr from "vite-plugin-svgr";
import path from "path";
import { visualizer } from "rollup-plugin-visualizer";
import analyzer from "rollup-plugin-analyzer";

export default defineConfig(() => {
  const projectRoot = __dirname;
  const rendererRoot = path.resolve(projectRoot, "src/renderer");
  const windowsRoot = path.resolve(rendererRoot, "windows");
  const isAnalyze = process.env.ANALYZE === "true";

  return {
    // Vite 개발 서버 루트: /main/index.html, /overlay/index.html 경로로 접근 가능
    root: windowsRoot,
    base: "./",
    plugins: [
      preact(),
      svgr({
        include: "**/*.svg",
        svgrOptions: {
          // named export: { ReactComponent }
          exportType: "default",
        },
      }),
      isAnalyze &&
        analyzer({
          summaryOnly: true,
        }),
      isAnalyze &&
        visualizer({
          filename: path.resolve(projectRoot, "dist", "stats.html"),
          template: "treemap",
          gzipSize: true,
          brotliSize: true,
          open: false,
        }),
    ].filter(Boolean),
    server: {
      port: 3400,
      strictPort: true,
      open: false,
      fs: {
        // 루트 상위(src/renderer 등) 경로 import 허용
        allow: [projectRoot, rendererRoot, windowsRoot],
      },
    },
    resolve: {
      alias: {
        react: "preact/compat",
        "react-dom": "preact/compat",
        "react-dom/test-utils": "preact/test-utils",
        "react/jsx-runtime": "preact/jsx-runtime",
        "@components": path.resolve(rendererRoot, "components"),
        "@styles": path.resolve(rendererRoot, "styles"),
        "@windows": path.resolve(rendererRoot, "windows"),
        "@hooks": path.resolve(rendererRoot, "hooks"),
        "@assets": path.resolve(rendererRoot, "assets"),
        "@utils": path.resolve(rendererRoot, "utils"),
        "@stores": path.resolve(rendererRoot, "stores"),
        "@constants": path.resolve(rendererRoot, "constants"),
        "@contexts": path.resolve(rendererRoot, "contexts"),
        "@shared": path.resolve(projectRoot, "src/types"),
        "@src": path.resolve(projectRoot, "src/"),
      },
      extensions: [".mjs", ".js", ".ts", ".jsx", ".tsx", ".json"],
    },
    build: {
      outDir: path.resolve(projectRoot, "dist/renderer"),
      emptyOutDir: true,
      rollupOptions: {
        input: {
          main: path.resolve(windowsRoot, "main/index.html"),
          overlay: path.resolve(windowsRoot, "overlay/index.html"),
        },
      },
    },
  };
});
