import { readFileIfExists, backupFile, writeFileSafe, ensureDir } from './utils.mjs';
import { ET_CONFIG_PATH, SSH_CONFIG_PATH, SSH_DIR, ET_KEEPALIVE, SSH_ALIVE_INTERVAL, SSH_ALIVE_COUNT } from './constants.mjs';

const ET_CONTENT = `; eternal terminal client config
; managed by cmux-persistent-ssh
keepalive = ${ET_KEEPALIVE}
verbose = 0
`;

export async function configureEt(log) {
  const existing = await readFileIfExists(ET_CONFIG_PATH);

  if (existing && existing.trim() === ET_CONTENT.trim()) {
    log('~/.et already configured, skipping');
    return false;
  }

  if (existing) await backupFile(ET_CONFIG_PATH);
  await writeFileSafe(ET_CONFIG_PATH, ET_CONTENT);
  log('wrote ~/.et with keepalive = 5');
  return true;
}

const SSH_HOST_RE = /^\s*Host\s+(\S+)/i;

export async function configureSsh(host, address, user, keyPath, log) {
  await ensureDir(SSH_DIR, 0o700);

  let content = await readFileIfExists(SSH_CONFIG_PATH) || '';
  const lines = content.split('\n');

  // find existing Host block for this host
  let blockStart = -1;
  let blockEnd = -1;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SSH_HOST_RE);
    if (match && match[1] === host) {
      blockStart = i;
      for (let j = i + 1; j < lines.length; j++) {
        if (SSH_HOST_RE.test(lines[j])) {
          blockEnd = j;
          break;
        }
      }
      if (blockEnd === -1) blockEnd = lines.length;
      break;
    }
  }

  const managedBlock = [
    `# managed by cmux-persistent-ssh`,
    `Host ${host}`,
    `    HostName ${address}`,
    `    User ${user}`,
    `    IdentityFile ${keyPath}`,
    `    ServerAliveInterval ${SSH_ALIVE_INTERVAL}`,
    `    ServerAliveCountMax ${SSH_ALIVE_COUNT}`,
    `    TCPKeepAlive yes`,
    `    RemoteForward /tmp/cmux-fwd.sock /tmp/cmux-local.sock`,
    `    SendEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID`,
  ];

  if (blockStart >= 0) {
    const existingBlock = lines.slice(blockStart, blockEnd);
    const has = (re) => existingBlock.some(l => re.test(l));

    const hasAll = has(/ServerAliveInterval/i)
      && has(/ServerAliveCountMax/i)
      && has(/TCPKeepAlive/i)
      && has(/RemoteForward/i)
      && has(/SendEnv.*CMUX/i);

    if (hasAll) {
      log(`~/.ssh/config Host ${host} already configured, skipping`);
      return false;
    }

    // update existing block: add missing settings
    const updatedBlock = [...existingBlock];
    if (!has(/ServerAliveInterval/i)) updatedBlock.push(`    ServerAliveInterval ${SSH_ALIVE_INTERVAL}`);
    if (!has(/ServerAliveCountMax/i)) updatedBlock.push(`    ServerAliveCountMax ${SSH_ALIVE_COUNT}`);
    if (!has(/TCPKeepAlive/i)) updatedBlock.push('    TCPKeepAlive yes');
    if (!has(/RemoteForward/i)) updatedBlock.push('    RemoteForward /tmp/cmux-fwd.sock /tmp/cmux-local.sock');
    if (!has(/SendEnv.*CMUX/i)) updatedBlock.push('    SendEnv CMUX_WORKSPACE_ID CMUX_SURFACE_ID CMUX_TAB_ID CMUX_PANEL_ID');

    await backupFile(SSH_CONFIG_PATH);
    const newLines = [...lines.slice(0, blockStart), ...updatedBlock, ...lines.slice(blockEnd)];
    await writeFileSafe(SSH_CONFIG_PATH, newLines.join('\n'));
    log(`updated ~/.ssh/config Host ${host}`);
    return true;
  }

  // no existing block — append
  await backupFile(SSH_CONFIG_PATH);
  const newContent = content.trimEnd() + '\n\n' + managedBlock.join('\n') + '\n';
  await writeFileSafe(SSH_CONFIG_PATH, newContent);
  log(`added Host ${host} to ~/.ssh/config`);
  return true;
}
