import { BASE_BUILD_OPTIONS, bundle, BundleOptions } from "./build-components.ts";
import {
  denoPlugins,
  dreamlabEngineExternalPlugin,
  dreamlabVendorExternalPlugin,
  esbuild,
} from "./_esbuild.ts";
import * as fs from "jsr:@std/fs@1";
import * as path from "jsr:@std/path@^1";

import { copy as esbuildCopy } from "npm:esbuild-plugin-copy@2.1.1";

export interface WorldBuildOptions {
  dir: string;
  // TODO: let people supply their own import map (craft a deno.json at runtime?)
  denoJsonPath: string;
  /** defaults to '_dist' */
  outDirName?: string;
}

export const prepareBundleWorld = async (
  worldOpts: WorldBuildOptions,
  opts?: BundleOptions,
): Promise<esbuild.BuildOptions> => {
  const out = worldOpts.outDirName ?? "_dist";

  await fs.ensureDir(path.join(worldOpts.dir, "src"));
  await fs.ensureDir(path.join(worldOpts.dir, "assets"));
  await fs.emptyDir(path.join(worldOpts.dir, out));

  const src = path.join(worldOpts.dir, "src");
  const entryPoints: esbuild.BuildOptions["entryPoints"] = [
    `${src}/**/*.ts`,
    `${src}/**/*.js`,
    `${src}/**/*.tsx`,
    `${src}/**/*.jsx`,
  ];

  const buildOpts: esbuild.BuildOptions = {
    ...BASE_BUILD_OPTIONS,
    plugins: [
      dreamlabEngineExternalPlugin(),
      dreamlabVendorExternalPlugin(),
      ...denoPlugins({
        loader: "native",
        configPath: await Deno.realPath(worldOpts.denoJsonPath),
      }),
      esbuildCopy({
        resolveFrom: "cwd",
        assets: {
          from: path.join(worldOpts.dir, "assets") + "/*",
          to: path.join(worldOpts.dir, out, "assets"),
        },
        watch: opts?.watch ?? false,
      }),
      esbuildCopy({
        resolveFrom: "cwd",
        assets: {
          from: path.join(worldOpts.dir, "project.json"),
          to: path.join(worldOpts.dir, out, "project.json"),
        },
        watch: opts?.watch ?? false,
      }),
      {
        name: "preload-behaviors",
        setup: (build: esbuild.PluginBuild) => {
          build.onEnd(async _result => {
            const behaviors = [];
            for (const entryPoint of entryPoints) {
              const expansion = fs.expandGlob(entryPoint);
              for await (const entry of expansion) {
                if (!entry.isFile) continue;
                const text = await Deno.readTextFile(entry.path);
                // me when i'm parsing
                if (
                  text.match(/export default class ([_\p{XID_Continue}]*) extends Behavior/u)
                ) {
                  behaviors.push(entry.path);
                }
              }
            }

            const behaviorFiles: Record<string, string> = {};
            for (const behaviorInputLocation of behaviors) {
              const sourceFile = path.relative(worldOpts.dir, behaviorInputLocation);
              const outputFile = sourceFile.replace(/\.tsx?$/, ".js");
              behaviorFiles[`${sourceFile}`] = `res://${outputFile}`;
            }

            await Deno.writeTextFile(
              path.join(worldOpts.dir, out, "_dreamlab_behaviors.json"),
              JSON.stringify(behaviorFiles, undefined, 2),
            );
          });
        },
      },
    ],
    entryPoints,
    outbase: worldOpts.dir,
    outdir: path.join(worldOpts.dir, out),
    logOverride: { "empty-glob": "silent" },
  };

  return buildOpts;
};

/**
 * Bundles a world into its '_dist' folder.
 * Requires `@dreamlab/engine` and `@dreamlab/vendor` to be present in the import map at runtime.
 */
export const bundleWorld = async (
  worldName: string,
  worldOpts: WorldBuildOptions,
  opts?: BundleOptions,
) => {
  const buildOpts = await prepareBundleWorld(worldOpts, opts);
  await bundle(`world ${worldName}`, buildOpts, opts);
};
