import { PROJECT_EXTENSION } from './projectFormat';

export function downloadText(content: string, filename: string, mime = 'text/plain'): void {
  const blob = new Blob([content], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function downloadBinary(buffer: ArrayBuffer, filename: string, mime: string): void {
  const blob = new Blob([buffer], { type: mime });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return file.arrayBuffer();
}

export function ensureExtension(name: string, ext: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(ext)) return name;
  return name + ext;
}

export function defaultProjectName(meshName: string): string {
  const base = meshName.replace(/[^\w.-]+/g, '_') || 'scene';
  return ensureExtension(base, PROJECT_EXTENSION);
}

type SavePicker = {
  createWritable: () => Promise<{
    write: (data: string | Blob) => Promise<void>;
    close: () => Promise<void>;
  }>;
};

type FilePickerWindow = Window & {
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<SavePicker>;
};

export async function saveTextWithPicker(
  content: string,
  suggestedName: string,
  mime: string,
  description: string,
  extension: string,
): Promise<boolean> {
  const win = window as FilePickerWindow;
  if (!win.showSaveFilePicker) {
    downloadText(content, suggestedName, mime);
    return false;
  }
  try {
    const handle = await win.showSaveFilePicker({
      suggestedName: ensureExtension(suggestedName, extension),
      types: [{ description, accept: { [mime]: [extension] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (err) {
    if ((err as DOMException)?.name === 'AbortError') return false;
    downloadText(content, suggestedName, mime);
    return false;
  }
}
