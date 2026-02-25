/**
 * Augments TypeScript's built-in DOM lib with File System Access API features
 * that are not yet fully included in TypeScript 5.x's standard lib:
 *  - showDirectoryPicker / showOpenFilePicker on Window
 *  - queryPermission / requestPermission on FileSystemHandle
 *  - AsyncIterableIterator-based .entries()/.keys()/.values() on FileSystemDirectoryHandle
 */

interface FileSystemPermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

interface FileSystemHandle {
  queryPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
  requestPermission(descriptor?: FileSystemPermissionDescriptor): Promise<PermissionState>;
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
  keys(): AsyncIterableIterator<string>;
  values(): AsyncIterableIterator<FileSystemHandle>;
  [Symbol.asyncIterator](): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface ShowDirectoryPickerOptions {
  id?: string;
  mode?: 'read' | 'readwrite';
  startIn?: 'desktop' | 'documents' | 'downloads' | 'music' | 'pictures' | 'videos' | FileSystemHandle;
}

interface ShowOpenFilePickerOptions {
  multiple?: boolean;
  excludeAcceptAllOption?: boolean;
  types?: Array<{ description?: string; accept: Record<string, string[]> }>;
  startIn?: string | FileSystemHandle;
}

interface Window {
  showDirectoryPicker(options?: ShowDirectoryPickerOptions): Promise<FileSystemDirectoryHandle>;
  showOpenFilePicker(options?: ShowOpenFilePickerOptions): Promise<FileSystemFileHandle[]>;
}
