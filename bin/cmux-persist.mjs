#!/usr/bin/env node

import * as p from '@clack/prompts';
import { detect } from '../lib/detect.mjs';
import { installDeps } from '../lib/install-deps.mjs';
import { configureEt, configureSsh } from '../lib/configure-client.mjs';
import { configureShell, uninstallShell } from '../lib/configure-shell.mjs';
import { configureServer } from '../lib/configure-server.mjs';
import { ET_KEEPALIVE, CLEANUP_DAYS, SSH_CONFIG_PATH } from '../lib/constants.mjs';
import { readFileIfExists, parseSshHostAddress, isValidHostname } from '../lib/utils.mjs';
import { userInfo } from 'node:os';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  cmux-persistent-ssh — bulletproof persistent terminal sessions

  usage:
    npx cmux-persistent-ssh          interactive setup wizard
    npx cmux-persistent-ssh --check  check system status (no changes)
    npx cmux-persistent-ssh --uninstall  remove shell functions from ~/.zshrc
  `);
  process.exit(0);
}

if (process.platform !== 'darwin') {
  console.error('cmux-persistent-ssh is macOS-only. sorry!');
  process.exit(1);
}

function guardCancel(value) {
  if (p.isCancel(value)) { p.cancel('setup cancelled'); process.exit(0); }
  return value;
}

async function runCheck() {
  p.intro('cmux-persistent-ssh — system check');

  const s = p.spinner();
  s.start('checking your system...');
  const detected = await detect();
  s.stop('system check complete');

  const status = (ok, label) => ok ? p.log.success(label) : p.log.warn(label);

  status(detected.brew, detected.brew ? `homebrew: ${detected.brew}` : 'homebrew: not found');
  status(detected.et, detected.et ? `et: ${detected.etVersion}` : 'et: not installed');
  status(detected.zellij, detected.zellij ? `zellij: ${detected.zellijVersion}` : 'zellij: not installed');
  status(detected.cmux, detected.cmux ? `cmux: found` : 'cmux: not found (sessions will use "unnamed-t1")');
  status(detected.hasEtConfig, detected.hasEtConfig ? '~/.et: configured' : '~/.et: not found');
  status(detected.hasExistingBlock, detected.hasExistingBlock ? '~/.zshrc: cmux-persistent-ssh block found' : '~/.zshrc: no block found');

  if (detected.sshHosts.length > 0) {
    p.log.info(`ssh hosts: ${detected.sshHosts.join(', ')}`);
  }

  p.outro('done');
}

async function runUninstall() {
  p.intro('cmux-persistent-ssh — uninstall');
  await uninstallShell(msg => p.log.info(msg));
  p.outro('done. run: source ~/.zshrc');
}

async function runSetup() {
  p.intro('cmux-persistent-ssh');
  p.log.info('sets up persistent terminal sessions with cmux + et + zellij');

  const s = p.spinner();
  s.start('checking your system...');
  const detected = await detect();
  s.stop('system check complete');

  if (detected.brew) p.log.success(`homebrew: ${detected.brew}`);
  else { p.log.error('homebrew is required. install from https://brew.sh'); process.exit(1); }

  if (detected.et) p.log.success(`et: ${detected.etVersion}`);
  else p.log.info('et: not found (will install via brew)');

  if (detected.zellij) p.log.success(`zellij: ${detected.zellijVersion}`);
  else p.log.info('zellij: not found (will install via brew)');

  if (detected.cmux) p.log.success('cmux: found');
  else p.log.warn('cmux: not found (sessions will fallback to "unnamed-t1")');

  if (detected.hasExistingBlock) p.log.info('existing config detected — will update in place');

  // ask questions with input validation
  const remoteHost = guardCancel(await p.text({
    message: 'remote host name (as used in ssh config)',
    placeholder: 'mini',
    defaultValue: 'mini',
    validate: v => {
      if (!v.trim()) return 'host name is required';
      if (!isValidHostname(v.trim())) return 'host name can only contain letters, numbers, dots, hyphens, underscores';
    },
  }));

  let hostAddress;
  if (!detected.sshHosts.includes(remoteHost)) {
    hostAddress = guardCancel(await p.text({
      message: 'host IP or hostname',
      placeholder: '192.168.1.200',
      validate: v => {
        if (!v.trim()) return 'address is required';
        if (!isValidHostname(v.trim())) return 'address can only contain letters, numbers, dots, hyphens';
      },
    }));
  }

  const sshUser = guardCancel(await p.text({
    message: 'ssh username',
    defaultValue: userInfo().username,
    placeholder: userInfo().username,
  }));

  const sshKey = guardCancel(await p.text({
    message: 'ssh key path',
    defaultValue: '~/.ssh/id_ed25519',
    placeholder: '~/.ssh/id_ed25519',
  }));

  const enableLocal = guardCancel(await p.confirm({
    message: 'enable local mode? (,() for local zellij sessions)',
    initialValue: true,
  }));

  const genServer = guardCancel(await p.confirm({
    message: 'generate server optimization script?',
    initialValue: true,
  }));

  p.note(
    [
      `remote host:    ${remoteHost}${hostAddress ? ` (${hostAddress})` : ''}`,
      `ssh user:       ${sshUser}`,
      `ssh key:        ${sshKey}`,
      `local mode:     ${enableLocal ? 'yes (,)' : 'no'}`,
      `server script:  ${genServer ? 'yes' : 'no'}`,
      '',
      'will configure:',
      '  ~/.et             ET keepalive',
      '  ~/.ssh/config     SSH keepalive for host',
      '  ~/.zshrc          shell functions (.  ,  ..)',
      genServer ? '  ~/cmux-persist-server-setup.sh' : '',
    ].filter(Boolean).join('\n'),
    "here's what we'll do"
  );

  const proceed = guardCancel(await p.confirm({ message: 'proceed?' }));
  if (!proceed) { p.log.info('ok, nothing changed.'); process.exit(0); }

  // execute
  const spin = p.spinner();

  spin.start('installing dependencies...');
  await installDeps(detected, msg => spin.message(msg));
  spin.stop('dependencies ready');

  spin.start('configuring eternal terminal...');
  await configureEt(msg => spin.message(msg));
  spin.stop('~/.et configured');

  spin.start('configuring ssh...');
  if (!hostAddress) {
    const sshContent = await readFileIfExists(SSH_CONFIG_PATH);
    hostAddress = parseSshHostAddress(sshContent, remoteHost) || remoteHost;
  }
  await configureSsh(remoteHost, hostAddress, sshUser, sshKey, msg => spin.message(msg));
  spin.stop('~/.ssh/config configured');

  spin.start('injecting shell functions...');
  await configureShell({
    remoteHost,
    etKeepalive: ET_KEEPALIVE,
    cleanupDays: CLEANUP_DAYS,
    enableLocal,
  }, msg => spin.message(msg));
  spin.stop('~/.zshrc configured');

  let serverScriptPath;
  if (genServer) {
    spin.start('generating server script...');
    serverScriptPath = await configureServer(remoteHost, msg => spin.message(msg));
    spin.stop('server script ready');
  }

  const nextSteps = [
    'restart your shell or run: source ~/.zshrc',
    '',
    'shortcuts:',
    '  .   remote ET + zellij (session = workspace-tN)',
    enableLocal ? '  ,   local zellij (same naming)' : null,
    '  ..  plain ET, no zellij',
  ].filter(Boolean);

  if (serverScriptPath) {
    nextSteps.push(
      '',
      'server setup (run on your remote host):',
      `  scp ~/cmux-persist-server-setup.sh ${remoteHost}:~/`,
      `  ssh ${remoteHost} 'bash ~/cmux-persist-server-setup.sh'`,
    );
  }

  p.note(nextSteps.join('\n'), 'next steps');
  p.outro("done! your sessions are now persistent. try '.' in a cmux tab.");
}

if (args.includes('--check')) {
  runCheck().catch(console.error);
} else if (args.includes('--uninstall')) {
  runUninstall().catch(console.error);
} else {
  runSetup().catch(console.error);
}
