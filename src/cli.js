#!/usr/bin/env node

import { promises as fs } from "fs";
import { Command } from "commander";
import path from "path";
import process from "process";
import { generateFromSchema } from "./generator.js";

const program = new Command();

program
  .name("schemacn")
  .description("Generate shadcn CRUD pages from a Prisma schema")
  .version("0.1.0");

program
  .command("generate")
  .description("Generate pages, components, and schemas")
  .option("--schema <path>", "Path to schema.prisma")
  .option("--out <path>", "Output directory")
  .option("--models <list>", "Comma-separated model list")
  .option("--config <path>", "Path to schemacn.json")
  .option(
    "--include-auth",
    "Include auth models (User, Account, Session, VerificationToken)"
  )
  .option("--force", "Overwrite existing files")
  .action(async (options) => {
    try {
      const cwd = process.cwd();
      const outDirHint = options.out ? path.resolve(options.out) : undefined;
      const loadedConfig = await loadConfig({
        explicitPath: options.config,
        outDirHint,
        cwd
      });
      const configData = loadedConfig?.config ?? {};
      const configDir = loadedConfig?.path ? path.dirname(loadedConfig.path) : cwd;

      const schemaPath = resolvePathOption(options.schema, configData.schema, configDir);
      if (!schemaPath) {
        throw new Error("Schema path is required. Use --schema or set it in schemacn.json.");
      }

      const outDir = resolveOutDir(options.out, configData.out, configDir, cwd);

      const cliModels = normalizeModelList(options.models, "models");
      const configInclude = mergeModelLists(
        normalizeModelList(configData.models, "models"),
        normalizeModelList(configData.includeModels, "includeModels")
      );
      const configExclude = normalizeModelList(configData.excludeModels, "excludeModels");

      const modelsOption = cliModels ? cliModels.join(",") : undefined;
      const includeModels = cliModels ? null : configInclude;
      const excludeModels = cliModels ? null : configExclude;

      let skipAuth = true;
      if (typeof configData.skipAuth === "boolean") {
        skipAuth = configData.skipAuth;
      } else if (typeof configData.includeAuth === "boolean") {
        skipAuth = !configData.includeAuth;
      }

      if (options.includeAuth === true) {
        skipAuth = false;
      }

      const force = options.force === true || configData.force === true;

      const { files, requiredUiComponents, requiredPackages } = await generateFromSchema({
        schemaPath,
        outDir,
        models: modelsOption,
        includeModels,
        excludeModels,
        force,
        skipAuth
      });

      const skipped = files.filter((item) => item.skipped);
      const written = files.filter((item) => !item.skipped);

      if (written.length > 0) {
        console.log("Generated:");
        for (const item of written) {
          console.log(`  - ${item.path}`);
        }
      }

      if (skipped.length > 0) {
        console.log("Skipped (already exists):");
        for (const item of skipped) {
          console.log(`  - ${item.path}`);
        }
      }

      await reportRequirements(outDir, requiredUiComponents, requiredPackages);
    } catch (error) {
      console.error("SchemaCN failed:", error.message);
      process.exit(1);
    }
  });

program.parse();

async function loadConfig({ explicitPath, outDirHint, cwd }) {
  const candidates = [];

  if (explicitPath) {
    candidates.push(path.resolve(explicitPath));
  }

  if (outDirHint) {
    candidates.push(path.join(outDirHint, "schemacn.json"));
  }

  candidates.push(path.join(cwd, "schemacn.json"));

  const uniqueCandidates = [...new Set(candidates)];

  for (const candidate of uniqueCandidates) {
    if (await fileExists(candidate)) {
      try {
        const raw = await fs.readFile(candidate, "utf8");
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") {
          throw new Error("Config must be a JSON object.");
        }
        return { path: candidate, config: parsed };
      } catch (error) {
        throw new Error(`Failed to parse config ${candidate}: ${error.message}`);
      }
    }
  }

  if (explicitPath) {
    throw new Error(`Config file not found: ${path.resolve(explicitPath)}`);
  }

  return null;
}

function resolvePathOption(cliValue, configValue, baseDir) {
  if (cliValue) return path.resolve(cliValue);
  if (!configValue) return null;
  return path.isAbsolute(configValue)
    ? configValue
    : path.resolve(baseDir, configValue);
}

function resolveOutDir(cliValue, configValue, baseDir, cwd) {
  if (cliValue) return path.resolve(cliValue);
  if (configValue) {
    return path.isAbsolute(configValue)
      ? configValue
      : path.resolve(baseDir, configValue);
  }
  return cwd;
}

function normalizeModelList(value, label) {
  if (!value) return null;

  if (Array.isArray(value)) {
    const trimmed = value.map((entry) => String(entry).trim()).filter(Boolean);
    return trimmed.length ? trimmed : null;
  }

  if (typeof value === "string") {
    const trimmed = value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean);
    return trimmed.length ? trimmed : null;
  }

  throw new Error(`Config field ${label} must be a string or array.`);
}

function mergeModelLists(...lists) {
  const merged = [];
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) {
      if (!merged.includes(item)) merged.push(item);
    }
  }
  return merged.length ? merged : null;
}

async function reportRequirements(outDir, requiredUiComponents, requiredPackages) {
  const missingUi = [];
  for (const component of requiredUiComponents) {
    const tsxPath = path.join(outDir, "components", "ui", `${component}.tsx`);
    const tsPath = path.join(outDir, "components", "ui", `${component}.ts`);
    if (!(await fileExists(tsxPath)) && !(await fileExists(tsPath))) {
      missingUi.push(component);
    }
  }

  if (missingUi.length > 0) {
    console.log("Missing shadcn/ui components:");
    for (const component of missingUi) {
      console.log(`  - ${component}`);
    }
    console.log(`Install with: npx shadcn@latest add ${missingUi.join(" ")}`);
  }

  const pkgJsonPath = path.join(outDir, "package.json");
  if (!(await fileExists(pkgJsonPath))) {
    console.log("Note: package.json not found; skipping dependency checks.");
    return;
  }

  const pkgJson = JSON.parse(await fs.readFile(pkgJsonPath, "utf8"));
  const deps = { ...pkgJson.dependencies, ...pkgJson.devDependencies };
  const missingDeps = requiredPackages.filter((dep) => !deps[dep]);

  if (missingDeps.length > 0) {
    console.log("Missing npm dependencies:");
    for (const dep of missingDeps) {
      console.log(`  - ${dep}`);
    }
    console.log(`Install with: npm install ${missingDeps.join(" ")}`);
  }
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
