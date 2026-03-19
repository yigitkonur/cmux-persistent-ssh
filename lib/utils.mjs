import { readFile, writeFile, copyFile, readdir, unlink, access, mkdir } from 'node:fs/promises';
import { exec as execCb } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, basename, join } from 'node:path';
import { MARKER_START, MARKER_END, BACKUP_SUFFIX } from './constants.mjs';

const execAsync = promisify(execCb);

export async function exec(cmd) {
  try {
    const { stdout, stderr } = await execAsync(cmd, {
      timeout: 30_000,
      shell: process.env.SHELL || '/bin/zsh',
      env: { ...process.env },
    });
    return { stdout: stdout.trim(), stderr: stderr.trim(), ok: true };
  } catch (err) {
    return { stdout: '', stderr: err.message, ok: false };
  }
}

export async function which(binary) {
  const { stdout, ok } = await exec(`which ${binary}`);
  return ok && stdout ? stdout.split('\n')[0] : null;
}

export async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

export async function readFileIfExists(path) {
  try {
    return await readFile(path, 'utf-8');
  } catch {
    return null;
  }
}

export async function ensureDir(dir, mode = 0o755) {
  try {
    await mkdir(dir, { recursive: true, mode });
  } catch {
    // already exists
  }
}

export async function backupFile(filePath) {
  if (!(await fileExists(filePath))) return null;

  const now = new Date();
  const ts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '-',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ].join('');

  const backupPath = `${filePath}${BACKUP_SUFFIX}.${ts}`;
  await copyFile(filePath, backupPath);

  // keep only last 3 backups
  const dir = dirname(filePath);
  const base = basename(filePath);
  const prefix = `${base}${BACKUP_SUFFIX}.`;

  try {
    const files = await readdir(dir);
    const backups = files
      .filter(f => f.startsWith(prefix))
      .sort()
      .reverse();

    for (const old of backups.slice(3)) {
      await unlink(join(dir, old)).catch(() => {});
    }
  } catch {
    // dir listing failed, no cleanup
  }

  return backupPath;
}

export function findMarkerBlock(content) {
  const lines = content.split('\n');
  const startLine = lines.findIndex(l => l.trim() === MARKER_START);
  const endLine = lines.findIndex(l => l.trim() === MARKER_END);

  if (startLine >= 0 && endLine > startLine) {
    return {
      found: true,
      startLine,
      endLine,
      block: lines.slice(startLine, endLine + 1).join('\n'),
    };
  }

  return { found: false, startLine, endLine, block: null };
}

export function replaceMarkerBlock(content, newBlock) {
  const lines = content.split('\n');
  const startLine = lines.findIndex(l => l.trim() === MARKER_START);
  const endLine = lines.findIndex(l => l.trim() === MARKER_END);

  if (startLine < 0 || endLine < 0) return appendMarkerBlock(content, newBlock);

  const before = lines.slice(0, startLine);
  const after = lines.slice(endLine + 1);
  return [...before, newBlock, ...after].join('\n');
}

export function appendMarkerBlock(content, newBlock) {
  const trimmed = content.trimEnd();
  return trimmed + '\n\n' + newBlock + '\n';
}

export async function writeFileSafe(path, content) {
  await writeFile(path, content, 'utf-8');
}

// shared SSH config parser
const SSH_HOST_RE = /^\s*Host\s+(\S+)/i;

export function parseSshHosts(content) {
  if (!content) return [];
  const hosts = [];
  for (const line of content.split('\n')) {
    const match = line.match(SSH_HOST_RE);
    if (match && !match[1].includes('*')) {
      hosts.push(match[1]);
    }
  }
  return hosts;
}

export function parseSshHostAddress(content, host) {
  if (!content) return null;
  const lines = content.split('\n');
  let inBlock = false;
  for (const line of lines) {
    const hostMatch = line.match(SSH_HOST_RE);
    if (hostMatch) {
      inBlock = hostMatch[1] === host;
      continue;
    }
    if (inBlock) {
      const addrMatch = line.match(/^\s*HostName\s+(\S+)/i);
      if (addrMatch) return addrMatch[1];
    }
  }
  return null;
}

// input validation for shell-safe hostnames
export function isValidHostname(value) {
  return /^[a-zA-Z0-9._-]+$/.test(value);
}
