// Vite plugin to remove console statements in production
export default function removeConsole() {
  return {
    name: "vite-plugin-remove-console",
    transform(code, id) {
      // Skip node_modules
      if (id.includes("node_modules")) {
        return null;
      }

      // Only process JS/TS files in production builds (not dev)
      if (process.env.NODE_ENV === "production" && /\.[jt]sx?$/.test(id)) {
        // Remove console.log, console.debug
        // Keep console.warn and console.error for debugging
        const transformed = code
          .replace(/console\.log\s*\([^)]*\)\s*;?/g, "")
          .replace(/console\.debug\s*\([^)]*\)\s*;?/g, "");

        return {
          code: transformed,
          map: null,
        };
      }

      return null;
    },
  };
}
