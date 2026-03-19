import { exec } from './utils.mjs';

export async function installDeps(detected, log) {
  if (!detected.brew) {
    throw new Error('homebrew is required. install it from https://brew.sh');
  }

  if (!detected.et) {
    log('installing eternal terminal via homebrew...');
    const { ok, stderr } = await exec('brew install et');
    if (!ok) throw new Error(`failed to install et: ${stderr}`);
  }

  if (!detected.zellij) {
    log('installing zellij via homebrew...');
    const { ok, stderr } = await exec('brew install zellij');
    if (!ok) throw new Error(`failed to install zellij: ${stderr}`);
  }
}
