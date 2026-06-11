declare module 'quill' {
  class Quill {
    constructor(container: HTMLElement | string, options?: any);
    getSemanticHTML?: () => string;
    getContents: () => any;
    getText: () => string;
    setText: (text: string) => void;
    dangerouslyPasteHTML: (index: number, html: string) => void;
    focus: () => void;
    on: (event: string, handler: (...args: any[]) => void) => void;
    root: HTMLElement;
    container: HTMLElement;
    clipboard: { dangerouslyPasteHTML: (index: number, html: string) => void };
    static register: (formats: Record<string, any>, suppressWarning?: boolean) => void;
  }
  export default Quill;
}
