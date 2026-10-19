import { cloudMode, windowsLocalMode } from '../lib/api';
import { windowsRepository } from './windowsRepository';
import { localRepository } from './localRepository';
import { remoteRepository } from './remoteRepository';
export { localRepository, downloadBackup } from './localRepository';
export const repository = windowsLocalMode
  ? windowsRepository
  : cloudMode
    ? remoteRepository
    : localRepository;
