declare module 'diff' {
  interface DiffPart {
    value: string;
    added?: boolean;
    removed?: boolean;
  }
  export function diffWords(oldStr: string, newStr: string): DiffPart[];
  export function diffChars(oldStr: string, newStr: string): DiffPart[];
  export function diffLines(oldStr: string, newStr: string): DiffPart[];
  export function createPatch(filename: string, oldStr: string, newStr: string): string;
}
