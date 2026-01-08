import { promises as fs } from "fs";
import path from "path";
import { buildTemplates } from "./templates.js";
import { parsePrismaSchema } from "./prisma.js";

async function readSchema(schemaPath) {
  return fs.readFile(schemaPath, "utf8");
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeFileSafe(filePath, content, force) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const overwrite = force === true;
  if (!overwrite && (await fileExists(filePath))) {
    return { skipped: true };
  }

  await fs.writeFile(filePath, content, "utf8");
  return { skipped: false };
}

function parseModelsOption(models) {
  if (!models) return null;
  return models
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

const UI_IMPORT_REGEX = /@\/components\/ui\/([\w-]+)/g;
const DEFAULT_AUTH_MODELS = new Set(["User", "Account", "Session", "VerificationToken"]);

function collectUiComponents(content) {
  const found = new Set();
  UI_IMPORT_REGEX.lastIndex = 0;
  let match = UI_IMPORT_REGEX.exec(content);
  while (match) {
    found.add(match[1]);
    match = UI_IMPORT_REGEX.exec(content);
  }
  return found;
}

export async function generateFromSchema({
  schemaPath,
  outDir,
  models,
  force,
  skipAuth,
  includeModels,
  excludeModels
}) {
  const schemaText = await readSchema(schemaPath);
  const { models: parsedModels, enums } = parsePrismaSchema(schemaText);
  const modelFilter = parseModelsOption(models);
  const includeList = includeModels?.length ? includeModels : null;
  const excludeList = excludeModels?.length ? excludeModels : null;
  const applyAuthFilter = skipAuth && !modelFilter && !includeList;

  let targetModels = modelFilter
    ? parsedModels.filter((model) => modelFilter.includes(model.name))
    : parsedModels;

  if (includeList) {
    targetModels = targetModels.filter((model) => includeList.includes(model.name));
  }

  if (applyAuthFilter) {
    targetModels = targetModels.filter((model) => !DEFAULT_AUTH_MODELS.has(model.name));
  }

  if (excludeList) {
    targetModels = targetModels.filter((model) => !excludeList.includes(model.name));
  }

  if (targetModels.length === 0) {
    throw new Error("No matching models found in schema.");
  }

  const results = [];
  const requiredUiComponents = new Set();
  const requiredPackages = new Set(["react-hook-form", "@hookform/resolvers", "zod"]);

  for (const model of targetModels) {
    const { paths, content } = buildTemplates(model, enums);

    for (const [key, relativePath] of Object.entries(paths)) {
      const absolutePath = path.join(outDir, relativePath);
      const { skipped } = await writeFileSafe(absolutePath, content[key], force);
      results.push({ path: relativePath, skipped });

      for (const component of collectUiComponents(content[key])) {
        requiredUiComponents.add(component);
      }
    }
  }

  return {
    files: results,
    requiredUiComponents: Array.from(requiredUiComponents).sort(),
    requiredPackages: Array.from(requiredPackages).sort()
  };
}
