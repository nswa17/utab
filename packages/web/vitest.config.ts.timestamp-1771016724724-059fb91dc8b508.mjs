// vitest.config.ts
import { defineConfig } from "file:///Users/neon/Desktop/utab/node_modules/.pnpm/vitest@1.6.1_@types+node@20.19.31_jsdom@24.1.3_terser@5.46.0/node_modules/vitest/dist/config.js";
import vue from "file:///Users/neon/Desktop/utab/node_modules/.pnpm/@vitejs+plugin-vue@5.2.4_vite@5.4.21_@types+node@20.19.31_terser@5.46.0__vue@3.5.27_typescript@5.4.5_/node_modules/@vitejs/plugin-vue/dist/index.mjs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
var __vite_injected_original_import_meta_url = "file:///Users/neon/Desktop/utab/packages/web/vitest.config.ts";
var __dirname = dirname(fileURLToPath(__vite_injected_original_import_meta_url));
var vitest_config_default = defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src")
    }
  },
  test: {
    globals: true,
    environment: "jsdom",
    passWithNoTests: true,
    testTimeout: 6e5,
    hookTimeout: 6e5,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "dist/", "**/*.d.ts", "**/*.config.*"]
    }
  }
});
export {
  vitest_config_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZXN0LmNvbmZpZy50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiY29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2Rpcm5hbWUgPSBcIi9Vc2Vycy9uZW9uL0Rlc2t0b3AvdXRhYi9wYWNrYWdlcy93ZWJcIjtjb25zdCBfX3ZpdGVfaW5qZWN0ZWRfb3JpZ2luYWxfZmlsZW5hbWUgPSBcIi9Vc2Vycy9uZW9uL0Rlc2t0b3AvdXRhYi9wYWNrYWdlcy93ZWIvdml0ZXN0LmNvbmZpZy50c1wiO2NvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9pbXBvcnRfbWV0YV91cmwgPSBcImZpbGU6Ly8vVXNlcnMvbmVvbi9EZXNrdG9wL3V0YWIvcGFja2FnZXMvd2ViL3ZpdGVzdC5jb25maWcudHNcIjtpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tICd2aXRlc3QvY29uZmlnJ1xuaW1wb3J0IHZ1ZSBmcm9tICdAdml0ZWpzL3BsdWdpbi12dWUnXG5pbXBvcnQgeyBmaWxlVVJMVG9QYXRoIH0gZnJvbSAnbm9kZTp1cmwnXG5pbXBvcnQgeyBkaXJuYW1lLCByZXNvbHZlIH0gZnJvbSAnbm9kZTpwYXRoJ1xuXG5jb25zdCBfX2Rpcm5hbWUgPSBkaXJuYW1lKGZpbGVVUkxUb1BhdGgoaW1wb3J0Lm1ldGEudXJsKSlcblxuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHtcbiAgcGx1Z2luczogW3Z1ZSgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICAnQCc6IHJlc29sdmUoX19kaXJuYW1lLCAnc3JjJyksXG4gICAgfSxcbiAgfSxcbiAgdGVzdDoge1xuICAgIGdsb2JhbHM6IHRydWUsXG4gICAgZW52aXJvbm1lbnQ6ICdqc2RvbScsXG4gICAgcGFzc1dpdGhOb1Rlc3RzOiB0cnVlLFxuICAgIHRlc3RUaW1lb3V0OiA2MDAwMDAsXG4gICAgaG9va1RpbWVvdXQ6IDYwMDAwMCxcbiAgICBjb3ZlcmFnZToge1xuICAgICAgcHJvdmlkZXI6ICd2OCcsXG4gICAgICByZXBvcnRlcjogWyd0ZXh0JywgJ2pzb24nLCAnaHRtbCddLFxuICAgICAgZXhjbHVkZTogWydub2RlX21vZHVsZXMvJywgJ2Rpc3QvJywgJyoqLyouZC50cycsICcqKi8qLmNvbmZpZy4qJ10sXG4gICAgfSxcbiAgfSxcbn0pXG4iXSwKICAibWFwcGluZ3MiOiAiO0FBQXFTLFNBQVMsb0JBQW9CO0FBQ2xVLE9BQU8sU0FBUztBQUNoQixTQUFTLHFCQUFxQjtBQUM5QixTQUFTLFNBQVMsZUFBZTtBQUhtSixJQUFNLDJDQUEyQztBQUtyTyxJQUFNLFlBQVksUUFBUSxjQUFjLHdDQUFlLENBQUM7QUFFeEQsSUFBTyx3QkFBUSxhQUFhO0FBQUEsRUFDMUIsU0FBUyxDQUFDLElBQUksQ0FBQztBQUFBLEVBQ2YsU0FBUztBQUFBLElBQ1AsT0FBTztBQUFBLE1BQ0wsS0FBSyxRQUFRLFdBQVcsS0FBSztBQUFBLElBQy9CO0FBQUEsRUFDRjtBQUFBLEVBQ0EsTUFBTTtBQUFBLElBQ0osU0FBUztBQUFBLElBQ1QsYUFBYTtBQUFBLElBQ2IsaUJBQWlCO0FBQUEsSUFDakIsYUFBYTtBQUFBLElBQ2IsYUFBYTtBQUFBLElBQ2IsVUFBVTtBQUFBLE1BQ1IsVUFBVTtBQUFBLE1BQ1YsVUFBVSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDakMsU0FBUyxDQUFDLGlCQUFpQixTQUFTLGFBQWEsZUFBZTtBQUFBLElBQ2xFO0FBQUEsRUFDRjtBQUNGLENBQUM7IiwKICAibmFtZXMiOiBbXQp9Cg==
