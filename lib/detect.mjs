import { which, fileExists, readFileIfExists, findMarkerBlock, exec } from './utils.mjs';
import { ET_CONFIG_PATH, SSH_CONFIG_PATH, ZSHRC_PATH } from './constants.mjs';

async function getVersion(cmd) {
  const { stdout, ok } = await exec(cmd);
  if (!ok) return null;
  const match = stdout.match(/[\d]+\.[\d]+\.[\d]+/);
  return match ? match[0] : stdout.split('\n')[0];
}

function parseSshHosts(content) {
  if (!content) return [];
  const hosts = [];
  for (const line of content.split('\n')) {
    const match = line.match(/^\s*Host\s+(\S+)/i);
    if (match && !match[1].includes('*')) {
      hosts.push(match[1]);
    }
  }
  return hosts;
}

export async function detect() {
  const [brew, et, zellij, cmux] = await Promise.all([
    which('brew'),
    which('et'),
    which('zellij'),
    which('cmux'),
  ]);

  const [etVersion, zellijVersion] = await Promise.all([
    et ? getVersion('et --version') : null,
    zellij ? getVersion('zellij --version') : null,
  ]);

  const [hasEtConfig, hasSshConfig, hasZshrc] = await Promise.all([
    fileExists(ET_CONFIG_PATH),
    fileExists(SSH_CONFIG_PATH),
    fileExists(ZSHRC_PATH),
  ]);

  let hasExistingBlock = false;
  let sshHosts = [];

  if (hasZshrc) {
    const content = await readFileIfExists(ZSHRC_PATH);
    if (content) hasExistingBlock = findMarkerBlock(content).found;
  }

  if (hasSshConfig) {
    const content = await readFileIfExists(SSH_CONFIG_PATH);
    sshHosts = parseSshHosts(content);
  }

  return {
    isMacOS: process.platform === 'darwin',
    brew,
    et,
    etVersion,
    zellij,
    zellijVersion,
    cmux,
    hasEtConfig,
    hasSshConfig,
    hasZshrc,
    hasExistingBlock,
    sshHosts,
  };
}
