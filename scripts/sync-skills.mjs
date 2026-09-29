import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

const CATALOGUE_ORIGIN = 'https://docs.glomo.one';
const INDEX_URL = `${CATALOGUE_ORIGIN}/.well-known/skills/index.json`;
const SKILLS_DIR = path.resolve(import.meta.dirname, '..', 'plugins', 'glomo', 'skills');
const SAFE_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/;
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`[sync-skills] ${url} returned ${response.status}`);
  return response.text();
}

async function main() {
  const index = JSON.parse(await fetchText(INDEX_URL));
  const skills = index.skills ?? [];
  if (skills.length === 0) throw new Error('[sync-skills] the catalogue lists no skills');

  const written = [];
  for (const skill of skills) {
    if (!SAFE_NAME.test(skill.name ?? '')) throw new Error(`[sync-skills] unsafe skill name: ${skill.name}`);
    const files = skill.files ?? [];
    if (!files.includes('SKILL.md')) throw new Error(`[sync-skills] ${skill.name} has no SKILL.md`);

    const dir = path.join(SKILLS_DIR, skill.name);
    await rm(dir, { recursive: true, force: true });
    await mkdir(dir, { recursive: true });
    for (const file of files) {
      if (!SAFE_FILE.test(file)) throw new Error(`[sync-skills] unsafe file name in ${skill.name}: ${file}`);
      const body = await fetchText(`${CATALOGUE_ORIGIN}/.well-known/skills/${skill.name}/${file}`);
      if (file === 'SKILL.md' && !new RegExp(`^---\\n(?:[\\s\\S]*?\\n)?name: ${skill.name}\\s*\\n`).test(body)) {
        throw new Error(`[sync-skills] ${skill.name}/SKILL.md frontmatter does not name the skill`);
      }
      await writeFile(path.join(dir, file), body);
    }
    written.push(`${skill.name}@${skill.version ?? 'unversioned'}`);
  }

  const listed = new Set(skills.map((skill) => skill.name));
  for (const entry of await readdir(SKILLS_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !listed.has(entry.name)) await rm(path.join(SKILLS_DIR, entry.name), { recursive: true, force: true });
  }

  console.error(`[sync-skills] synced ${written.length} skills from ${INDEX_URL}: ${written.join(', ')}`);
}

main().catch((error) => {
  console.error(error.message ?? error);
  process.exit(1);
});
