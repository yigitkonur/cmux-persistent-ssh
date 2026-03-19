import { which, fileExists, readFileIfExists, findMarkerBlock, exec, parseSshHosts } from './utils.mjs';
import { ET_CONFIG_PATH, SSH_CONFIG_PATH, ZSHRC_PATH } from './constants.mjs';

async function getVersion(cmd) {
  const { stdout, ok } = await exec(cmd);
  if (!ok) return null;
  const match = stdout.match(/[\d]+\.[\d]+\.[\d]+/);
  return match ? match[0] : stdout.split('\n')[0];
}

export async function detect() {
  const [brew, et, zellij, cmux] = await Promise.all([
    which('brew'),
    which('et'),
    which('zellij'),
    which('cmux'),
  ]);

  // parallelize version checks + file existence + file reads
  const [etVersion, zellijVersion, hasEtConfig, hasSshConfig, hasZshrc] = await Promise.all([
    et ? getVersion('et --version') : null,
    zellij ? getVersion('zellij --version') : null,
    fileExists(ET_CONFIG_PATH),
    fileExists(SSH_CONFIG_PATH),
    fileExists(ZSHRC_PATH),
  ]);

  // read both files in parallel
  const [zshrcContent, sshContent] = await Promise.all([
    hasZshrc ? readFileIfExists(ZSHRC_PATH) : null,
    hasSshConfig ? readFileIfExists(SSH_CONFIG_PATH) : null,
  ]);

  const hasExistingBlock = zshrcContent ? findMarkerBlock(zshrcContent).found : false;
  const sshHosts = parseSshHosts(sshContent);

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
