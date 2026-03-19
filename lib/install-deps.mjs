import { exec } from './utils.mjs';

export async function installDeps(detected, log) {
  if (!detected.brew) {
    throw new Error('homebrew is required. install it from https://brew.sh');
  }

  const toInstall = [];
  if (!detected.et) toInstall.push('et');
  if (!detected.zellij) toInstall.push('zellij');

  if (toInstall.length === 0) return;

  log(`installing ${toInstall.join(' + ')} via homebrew...`);
  const { ok, stderr } = await exec(`brew install ${toInstall.join(' ')}`);
  if (!ok) throw new Error(`failed to install ${toInstall.join(', ')}: ${stderr}`);
}
