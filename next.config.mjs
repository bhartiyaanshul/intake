/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  webpack: (config, { webpack }) => {
    // pdfjs-dist and tesseract.js reference optional Node built-ins that don't
    // exist in the browser bundle. Stub them so the client build stays clean.
    config.resolve.fallback = {
      ...config.resolve.fallback,
      canvas: false,
      fs: false,
      path: false,
    };

    // pdf.js v4 ships its worker as an ES module (pdf.worker.min.mjs). We bundle
    // it via `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` so
    // it works on Vercel with no CDN config. Next's production Terser pass tries
    // to minify the emitted worker as a classic script and chokes on its
    // top-level import/export. The worker is already minified upstream, so we
    // flag the emitted asset as `minimized` before Terser's optimize stage —
    // Next's minifier skips assets already marked minimized.
    config.plugins.push({
      apply(compiler) {
        const { Compilation } = webpack;
        compiler.hooks.thisCompilation.tap(
          "SkipPdfWorkerMinify",
          (compilation) => {
            compilation.hooks.processAssets.tap(
              {
                name: "SkipPdfWorkerMinify",
                stage: Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE,
              },
              (assets) => {
                for (const name of Object.keys(assets)) {
                  if (/pdf\.worker/.test(name)) {
                    const asset = compilation.getAsset(name);
                    if (asset && !asset.info.minimized) {
                      compilation.updateAsset(name, asset.source, {
                        ...asset.info,
                        minimized: true,
                      });
                    }
                  }
                }
              },
            );
          },
        );
      },
    });

    return config;
  },
};

export default nextConfig;
