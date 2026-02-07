const esbuild = require("esbuild");

const isWatch = process.argv.includes("--watch");

/** @type {esbuild.BuildOptions} */
const nodeOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node18",
  sourcemap: true,
  minify: false,
};

/** @type {esbuild.BuildOptions} */
const webOptions = {
  entryPoints: ["src/extension.ts"],
  bundle: true,
  outfile: "out/web/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "browser",
  sourcemap: true,
  minify: false,
};

async function main() {
  if (isWatch) {
    const [nodeCtx, webCtx] = await Promise.all([
      esbuild.context(nodeOptions),
      esbuild.context(webOptions),
    ]);
    await Promise.all([nodeCtx.watch(), webCtx.watch()]);
    console.log("Watching for changes...");
  } else {
    await Promise.all([
      esbuild.build(nodeOptions),
      esbuild.build(webOptions),
    ]);
    console.log("Build complete (node + web).");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
