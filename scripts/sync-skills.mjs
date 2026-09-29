import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATALOGUE_ORIGIN = 'https://docs.glomo.one';
const INDEX_URL = `${CATALOGUE_ORIGIN}/.well-known/skills/index.json`;
const PLUGIN_DIR = path.resolve(import.meta.dirname, '..', 'plugins', 'glomo');
const SKILLS_DIR = path.join(PLUGIN_DIR, 'skills');
const PLUGIN_MANIFEST = path.join(PLUGIN_DIR, '.claude-plugin', 'plugin.json');
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const PLUGIN = 'glomo';
const CATALOGUE_PREFIX = `${PLUGIN}-`;

function pluginName(catalogueName) {
  return catalogueName.startsWith(CATALOGUE_PREFIX) ? catalogueName.slice(CATALOGUE_PREFIX.length) : catalogueName;
}

function toPluginNames(body, catalogueNames) {
  let result = body;
  for (const name of catalogueNames) {
    result = result
      .replace(new RegExp(`^(---\\n(?:[\\s\\S]*?\\n)?name: )${name}(\\s*\\n)`), `$1${pluginName(name)}$2`)
      .replaceAll(`\`${name}\``, `\`${PLUGIN}:${pluginName(name)}\``);
  }
  return result;
}

async function fetchText(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`[sync-skills] ${url} returned ${response.status}`);
  return response.text();
}

async function fetchCatalogue() {
  const index = JSON.parse(await fetchText(INDEX_URL));
  const skills = index.skills;
  if (!Array.isArray(skills) || skills.length === 0) throw new Error('[sync-skills] the catalogue lists no skills');

  const catalogueNames = skills.map((skill) => skill.name);
  for (const name of catalogueNames) {
    if (!SAFE_NAME.test(name ?? '') || !SAFE_NAME.test(pluginName(name))) throw new Error(`[sync-skills] unsafe skill name: ${name}`);
  }
  if (new Set(catalogueNames.map(pluginName)).size !== catalogueNames.length) {
    throw new Error('[sync-skills] two skills map to the same plugin skill name');
  }

  const tree = new Map();
  for (const skill of skills) {
    const files = skill.files;
    if (!Array.isArray(files) || !files.includes('SKILL.md')) throw new Error(`[sync-skills] ${skill.name} has no SKILL.md`);
    for (const file of files) {
      if (typeof file !== 'string' || !SAFE_FILE.test(file)) throw new Error(`[sync-skills] unsafe file name in ${skill.name}: ${file}`);
      const body = await fetchText(`${CATALOGUE_ORIGIN}/.well-known/skills/${skill.name}/${file}`);
      if (file === 'SKILL.md' && !new RegExp(`^---\\n(?:[\\s\\S]*?\\n)?name: ${skill.name}\\s*\\n`).test(body)) {
        throw new Error(`[sync-skills] ${skill.name}/SKILL.md frontmatter does not name the skill`);
      }
      tree.set(path.join(pluginName(skill.name), file), file.endsWith('.md') ? toPluginNames(body, catalogueNames) : body);
    }
  }
  return { tree, synced: skills.map((skill) => `${pluginName(skill.name)}@${skill.version ?? 'unversioned'}`) };
}

async function readSkillsTree() {
  const tree = new Map();
  const entries = await readdir(SKILLS_DIR, { recursive: true, withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const absolute = path.join(entry.parentPath, entry.name);
    tree.set(path.relative(SKILLS_DIR, absolute), await readFile(absolute, 'utf8'));
  }
  return tree;
}

function sameTree(a, b) {
  return a.size === b.size && [...a].every(([file, body]) => b.get(file) === body);
}

async function bumpPluginVersion() {
  const manifest = await readFile(PLUGIN_MANIFEST, 'utf8');
  let bumped;
  const updated = manifest.replace(/"version": "(\d+)\.(\d+)\.(\d+)"/, (_, major, minor, patch) => {
    bumped = `${major}.${minor}.${Number(patch) + 1}`;
    return `"version": "${bumped}"`;
  });
  if (!bumped) throw new Error(`[sync-skills] no x.y.z version in ${PLUGIN_MANIFEST}`);
  await writeFile(PLUGIN_MANIFEST, updated);
  return bumped;
}

async function main() {
  const { tree, synced } = await fetchCatalogue();
  if (sameTree(tree, await readSkillsTree())) {
    console.error(`[sync-skills] skills are up to date with ${INDEX_URL}`);
    return;
  }

  await rm(SKILLS_DIR, { recursive: true, force: true });
  for (const [file, body] of tree) {
    await mkdir(path.join(SKILLS_DIR, path.dirname(file)), { recursive: true });
    await writeFile(path.join(SKILLS_DIR, file), body);
  }
  const version = await bumpPluginVersion();
  console.error(`[sync-skills] synced ${synced.length} skills from ${INDEX_URL} (${synced.join(', ')}); plugin version ${version}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
