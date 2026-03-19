import { readFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileIfExists, backupFile, writeFileSafe, findMarkerBlock, replaceMarkerBlock, appendMarkerBlock } from './utils.mjs';
import { ZSHRC_PATH, MARKER_START, MARKER_END } from './constants.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function renderTemplate(template, vars) {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replaceAll(`{{${key}}}`, String(value));
  }
  return result;
}

export async function configureShell(options, log) {
  const { remoteHost, etKeepalive, cleanupDays, enableLocal } = options;

  // read template
  const templatePath = join(__dirname, '..', 'templates', 'shell-functions.zsh');
  let template = await readFile(templatePath, 'utf-8');

  // if local mode disabled, remove the ,() function
  if (!enableLocal) {
    const lines = template.split('\n');
    const commaStart = lines.findIndex(l => l.startsWith(',()'));
    if (commaStart >= 0) {
      // find the closing brace
      let commaEnd = commaStart;
      for (let i = commaStart; i < lines.length; i++) {
        if (lines[i] === '}') { commaEnd = i; break; }
      }
      // also remove the blank line after if present
      if (lines[commaEnd + 1]?.trim() === '') commaEnd++;
      lines.splice(commaStart, commaEnd - commaStart + 1);
      template = lines.join('\n');
    }
  }

  const rendered = renderTemplate(template, {
    REMOTE_HOST: remoteHost,
    ET_KEEPALIVE: etKeepalive,
    CLEANUP_DAYS: cleanupDays,
  });

  // read zshrc
  let content = await readFileIfExists(ZSHRC_PATH);
  if (!content) {
    log('~/.zshrc not found, creating it');
    content = '';
  }

  const { found, block } = findMarkerBlock(content);

  if (found && block === rendered) {
    log('~/.zshrc already up to date, skipping');
    return false;
  }

  await backupFile(ZSHRC_PATH);

  let newContent;
  if (found) {
    newContent = replaceMarkerBlock(content, rendered);
    log('updated existing cmux-persistent-ssh block in ~/.zshrc');
  } else {
    newContent = appendMarkerBlock(content, rendered);
    log('appended cmux-persistent-ssh block to ~/.zshrc');
  }

  await writeFileSafe(ZSHRC_PATH, newContent);
  return true;
}

export async function uninstallShell(log) {
  const content = await readFileIfExists(ZSHRC_PATH);
  if (!content) {
    log('~/.zshrc not found, nothing to remove');
    return false;
  }

  const { found } = findMarkerBlock(content);
  if (!found) {
    log('no cmux-persistent-ssh block found in ~/.zshrc');
    return false;
  }

  await backupFile(ZSHRC_PATH);

  const lines = content.split('\n');
  const startLine = lines.findIndex(l => l.trim() === MARKER_START);
  const endLine = lines.findIndex(l => l.trim() === MARKER_END);
  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);

  // remove extra blank lines at the join point
  while (before.length > 0 && before[before.length - 1].trim() === '' && after.length > 0 && after[0].trim() === '') {
    after.shift();
  }

  await writeFileSafe(ZSHRC_PATH, [...before, ...after].join('\n'));
  log('removed cmux-persistent-ssh block from ~/.zshrc');
  return true;
}
