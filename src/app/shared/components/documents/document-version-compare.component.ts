import { CommonModule } from '@angular/common';
import { Component, computed, effect, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { diffWords } from 'diff';
import { WorkflowDocumentVersion, WorkflowVersionCompareApi } from '../../../core/models/workflow.models';
import { WorkflowService } from '../../../core/services/workflow.service';
import { formatFileSize, mimeTypeLabel } from '../../utils/file-format.utils';

interface DiffHunk {
  header: string;
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  rows: DiffLine[];
}

interface DiffLine {
  type: 'added' | 'removed' | 'context';
  content: string;
  oldLineNo: number | null;
  newLineNo: number | null;
  leftHtml: string;
  rightHtml: string;
}

@Component({
  selector: 'app-document-version-compare',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './document-version-compare.component.html',
  styleUrl: './document-version-compare.component.scss',
})
export class DocumentVersionCompareComponent {
  private readonly workflowService = inject(WorkflowService);

  readonly documentId = input.required<string>();
  readonly documentName = input('');
  readonly versions = input<WorkflowDocumentVersion[]>([]);
  readonly close = output<void>();

  readonly fromVersion = signal<number | null>(null);
  readonly toVersion = signal<number | null>(null);
  readonly comparing = signal(false);
  readonly error = signal('');
  readonly result = signal<WorkflowVersionCompareApi | null>(null);
  readonly viewMode = signal<'side-by-side' | 'unified'>('side-by-side');

  readonly sortedVersions = computed(() => [...this.versions()].sort((a, b) => a.version - b.version));
  readonly canCompare = computed(() => this.sortedVersions().length >= 2 && this.fromVersion() !== this.toVersion());

  readonly hunks = computed(() => this.parseDiff(this.result()?.text_diff ?? []));
  readonly addedCount = computed(() => this.result()?.added_lines ?? 0);
  readonly removedCount = computed(() => this.result()?.removed_lines ?? 0);
  readonly changedCount = computed(() => this.result()?.changed_lines ?? 0);
  readonly similarity = computed(() => Math.round((this.result()?.similarity_ratio ?? 0) * 100));

  formatFileSize = formatFileSize;
  mimeTypeLabel = mimeTypeLabel;

  constructor() {
    effect(() => {
      const versions = this.sortedVersions();
      if (versions.length < 2) {
        this.fromVersion.set(versions[0]?.version ?? null);
        this.toVersion.set(versions[0]?.version ?? null);
        return;
      }
      this.fromVersion.set(versions[versions.length - 2].version);
      this.toVersion.set(versions[versions.length - 1].version);
    });
  }

  compare(): void {
    const from = this.fromVersion();
    const to = this.toVersion();
    if (!from || !to || from === to) return;
    this.comparing.set(true);
    this.error.set('');
    this.workflowService.compareVersions(this.documentId(), from, to).subscribe({
      next: (result) => { this.result.set(result); this.comparing.set(false); },
      error: (err) => { this.error.set(err?.error?.detail ?? 'No se pudo comparar las versiones'); this.comparing.set(false); },
    });
  }

  toggleView(): void {
    this.viewMode.set(this.viewMode() === 'side-by-side' ? 'unified' : 'side-by-side');
  }

  closeModal(): void {
    this.close.emit();
  }

  private parseDiff(lines: string[]): DiffHunk[] {
    if (!lines.length) return [];
    const hunks: DiffHunk[] = [];
    let currentHunk: DiffHunk | null = null;
    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      if (line.startsWith('@@')) {
        const match = line.match(/@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)/);
        if (match) {
          currentHunk = {
            header: match[5]?.trim() ?? '',
            oldStart: parseInt(match[1], 10),
            oldCount: parseInt(match[2] ?? '1', 10),
            newStart: parseInt(match[3], 10),
            newCount: parseInt(match[4] ?? '1', 10),
            rows: [],
          };
          hunks.push(currentHunk);
          oldLine = parseInt(match[1], 10);
          newLine = parseInt(match[3], 10);
        }
        continue;
      }
      if (line.startsWith('---') || line.startsWith('+++')) continue;
      if (!currentHunk) continue;

      if (line.startsWith('-')) {
        currentHunk.rows.push({
          type: 'removed',
          content: line.slice(1),
          oldLineNo: oldLine++,
          newLineNo: null,
          leftHtml: this.escapeHtml(line.slice(1)),
          rightHtml: '',
        });
      } else if (line.startsWith('+')) {
        currentHunk.rows.push({
          type: 'added',
          content: line.slice(1),
          oldLineNo: null,
          newLineNo: newLine++,
          leftHtml: '',
          rightHtml: this.escapeHtml(line.slice(1)),
        });
      } else {
        const ctx = line.startsWith(' ') ? line.slice(1) : line;
        currentHunk.rows.push({
          type: 'context',
          content: ctx,
          oldLineNo: oldLine++,
          newLineNo: newLine++,
          leftHtml: this.escapeHtml(ctx),
          rightHtml: this.escapeHtml(ctx),
        });
      }
    }

    this.pairAndHighlight(hunks);
    return hunks;
  }

  private pairAndHighlight(hunks: DiffHunk[]): void {
    for (const hunk of hunks) {
      const paired: DiffLine[] = [];
      const rows = hunk.rows;
      let i = 0;
      while (i < rows.length) {
        if (rows[i].type === 'removed') {
          const removed: DiffLine[] = [];
          while (i < rows.length && rows[i].type === 'removed') {
            removed.push(rows[i++]);
          }
          const added: DiffLine[] = [];
          while (i < rows.length && rows[i].type === 'added') {
            added.push(rows[i++]);
          }
          const pairCount = Math.max(removed.length, added.length);
          for (let p = 0; p < pairCount; p++) {
            const leftText = removed[p]?.content ?? '';
            const rightText = added[p]?.content ?? '';
            const wordDiff = diffWords(leftText, rightText);
            const leftParts: string[] = [];
            const rightParts: string[] = [];
            for (const part of wordDiff) {
              const safe = this.escapeHtml(part.value);
              if (part.added) {
                rightParts.push(`<ins>${safe}</ins>`);
              } else if (part.removed) {
                leftParts.push(`<del>${safe}</del>`);
              } else {
                leftParts.push(safe);
                rightParts.push(safe);
              }
            }
            paired.push({
              type: 'removed',
              content: leftText,
              oldLineNo: removed[p]?.oldLineNo ?? null,
              newLineNo: null,
              leftHtml: leftParts.join(''),
              rightHtml: '',
            });
            if (rightText) {
              paired.push({
                type: 'added',
                content: rightText,
                oldLineNo: null,
                newLineNo: added[p]?.newLineNo ?? null,
                leftHtml: '',
                rightHtml: rightParts.join(''),
              });
            }
          }
        } else {
          paired.push(rows[i]);
          i++;
        }
      }
      hunk.rows = paired;
    }
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
