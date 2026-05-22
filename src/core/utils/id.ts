let counter = 0;

export function generateId(prefix = 'node'): string {
  counter += 1;
  return `${prefix}_${Date.now()}_${counter}`;
}

export function resetIdCounter(): void {
  counter = 0;
}
