import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Input,
  Output,
  EventEmitter,
  forwardRef,
  inject,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  signal,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

export interface SelectOption {
  value: string;
  label: string;
}

@Component({
  selector: 'app-custom-select',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './custom-select.component.html',
  styleUrl: './custom-select.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CustomSelectComponent),
      multi: true,
    },
  ],
})
export class CustomSelectComponent implements ControlValueAccessor, OnChanges, OnDestroy {
  private readonly elementRef = inject(ElementRef<HTMLElement>);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly onScrollReposition = (): void => {
    if (this.open()) {
      this.updateMenuPosition();
    }
  };

  @Input() options: SelectOption[] = [];
  @Input() placeholder = 'Seleccionar';
  @Input() ariaLabel = 'Seleccionar opción';
  @Input() compact = false;
  @Input() set selectValue(value: string | null | undefined) {
    if (!this.formAttached) {
      this.writeValue(value ?? '');
    }
  }
  @Output() readonly selectValueChange = new EventEmitter<string>();

  readonly open = signal(false);
  readonly value = signal('');
  readonly menuStyle = signal<Record<string, string> | null>(null);

  private onChange: (value: string) => void = () => undefined;
  private onTouched: () => void = () => undefined;
  private disabled = false;
  private formAttached = false;

  get selectedLabel(): string {
    const current = this.options.find((option) => option.value === this.value());
    return current?.label ?? this.placeholder;
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
    this.cdr.markForCheck();
  }

  registerOnChange(fn: (value: string) => void): void {
    this.formAttached = true;
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
    this.cdr.markForCheck();
  }

  isDisabled(): boolean {
    return this.disabled;
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['options'] || changes['selectValue']) {
      this.cdr.markForCheck();
    }
  }

  toggle(): void {
    if (this.disabled) {
      return;
    }
    this.open.update((current) => !current);
    if (this.open()) {
      requestAnimationFrame(() => {
        this.updateMenuPosition();
        this.cdr.markForCheck();
      });
      document.addEventListener('scroll', this.onScrollReposition, true);
      this.cdr.markForCheck();
      return;
    }
    this.detachScrollListener();
    this.menuStyle.set(null);
    this.onTouched();
    this.cdr.markForCheck();
  }

  close(): void {
    if (!this.open()) {
      return;
    }
    this.open.set(false);
    this.menuStyle.set(null);
    this.detachScrollListener();
    this.onTouched();
  }

  ngOnDestroy(): void {
    this.detachScrollListener();
  }

  private detachScrollListener(): void {
    document.removeEventListener('scroll', this.onScrollReposition, true);
  }

  private updateMenuPosition(): void {
    const trigger = this.elementRef.nativeElement.querySelector('.custom-select__trigger') as HTMLElement | null;
    if (!trigger) {
      return;
    }

    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 8;
    const gap = 6;
    const preferredMaxHeight = 224;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(
      120,
      Math.min(preferredMaxHeight, openUpward ? spaceAbove - gap : spaceBelow - gap),
    );

    if (openUpward) {
      this.menuStyle.set({
        top: `${Math.max(viewportPadding, rect.top - gap - maxHeight)}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        maxHeight: `${maxHeight}px`,
      });
      this.cdr.markForCheck();
      return;
    }

    this.menuStyle.set({
      top: `${rect.bottom + gap}px`,
      left: `${rect.left}px`,
      width: `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
    });
    this.cdr.markForCheck();
  }

  select(option: SelectOption): void {
    this.value.set(option.value);
    this.onChange(option.value);
    this.selectValueChange.emit(option.value);
    this.close();
  }

  isSelected(option: SelectOption): boolean {
    return this.value() === option.value;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.open()) {
      return;
    }

    const target = event.target as Node | null;
    if (target && !this.elementRef.nativeElement.contains(target)) {
      this.close();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.open()) {
      this.updateMenuPosition();
    }
  }
}
