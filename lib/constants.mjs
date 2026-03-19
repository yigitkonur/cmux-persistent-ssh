import { homedir } from 'node:os';
import { join } from 'node:path';

export const MARKER_START = '# >>> cmux-persistent-ssh >>>';
export const MARKER_END = '# <<< cmux-persistent-ssh <<<';
export const BACKUP_SUFFIX = '.cmux-persist.bak';

export const HOME = homedir();
export const ET_CONFIG_PATH = join(HOME, '.et');
export const SSH_CONFIG_PATH = join(HOME, '.ssh', 'config');
export const SSH_DIR = join(HOME, '.ssh');
export const ZSHRC_PATH = join(HOME, '.zshrc');
export const SERVER_SCRIPT_PATH = join(HOME, 'cmux-persist-server-setup.sh');

export const ET_KEEPALIVE = 5;
export const SSH_ALIVE_INTERVAL = 60;
export const SSH_ALIVE_COUNT = 120;
export const CLEANUP_DAYS = 7;
