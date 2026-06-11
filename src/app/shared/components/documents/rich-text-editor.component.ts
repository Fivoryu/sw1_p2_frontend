import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  ViewChild,
  effect,
  input,
  output,
} from '@angular/core';
import Quill from 'quill';
import { toEditorHtml } from '../../utils/rich-text.utils';

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ align: [] }],
  ['blockquote', 'link'],
  ['clean'],
];

@Component({
  selector: 'app-rich-text-editor',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './rich-text-editor.component.html',
  styleUrl: './rich-text-editor.component.scss',
})
export class RichTextEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorHost', { static: true }) editorHost!: ElementRef<HTMLDivElement>;

  readonly value = input('');
  readonly placeholder = input('Escribí el contenido del documento aquí...');
  readonly valueChange = output<string>();

  private quill: Quill | null = null;
  private suppressChange = false;

  constructor() {
    effect(() => {
      const incoming = this.value();
      if (!this.quill || this.suppressChange) {
        return;
      }
      const current = this.getHtml();
      if (incoming !== current) {
        this.setHtml(incoming);
      }
    });
  }

  ngAfterViewInit(): void {
    this.quill = new Quill(this.editorHost.nativeElement, {
      theme: 'snow',
      placeholder: this.placeholder(),
      modules: {
        toolbar: TOOLBAR_OPTIONS,
      },
    });

    this.quill.on('text-change', () => {
      if (this.suppressChange) {
        return;
      }
      this.valueChange.emit(this.getHtml());
    });

    const initial = this.value();
    if (initial) {
      this.setHtml(initial);
    }
  }

  ngOnDestroy(): void {
    this.quill = null;
  }

  getHtml(): string {
    if (!this.quill) {
      return this.value();
    }
    const semantic = (this.quill as Quill & { getSemanticHTML?: () => string }).getSemanticHTML?.();
    return semantic ?? this.quill.root.innerHTML;
  }

  setHtml(content: string): void {
    if (!this.quill) {
      return;
    }
    this.suppressChange = true;
    const html = toEditorHtml(content);
    this.quill.setText('');
    (this.quill as any).clipboard.dangerouslyPasteHTML(0, html);
    this.suppressChange = false;
  }

  focus(): void {
    this.quill?.focus();
  }
}
