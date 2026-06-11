export type FileKind = 'pdf' | 'image' | 'word' | 'excel' | 'text' | 'archive' | 'other';

export function formatFileSize(bytes: number): string {
  if (!bytes || bytes <= 0) {
    return '—';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mimeTypeKind(mimeType: string): FileKind {
  const value = (mimeType || '').toLowerCase();
  if (value.includes('pdf')) {
    return 'pdf';
  }
  if (value.startsWith('image/')) {
    return 'image';
  }
  if (value.includes('word') || value.includes('document')) {
    return 'word';
  }
  if (value.includes('sheet') || value.includes('excel')) {
    return 'excel';
  }
  if (value.startsWith('text/')) {
    return 'text';
  }
  if (value.includes('zip') || value.includes('rar') || value.includes('compressed')) {
    return 'archive';
  }
  return 'other';
}

export function mimeTypeLabel(mimeType: string): string {
  const kind = mimeTypeKind(mimeType);
  return {
    pdf: 'PDF',
    image: 'Imagen',
    word: 'Word',
    excel: 'Excel',
    text: 'Texto',
    archive: 'Comprimido',
    other: mimeType?.split('/')[1]?.toUpperCase() || 'Archivo',
  }[kind];
}

export function fileKindLabel(kind: FileKind): string {
  return {
    pdf: 'PDF',
    image: 'IMG',
    word: 'DOC',
    excel: 'XLS',
    text: 'TXT',
    archive: 'ZIP',
    other: 'FILE',
  }[kind];
}

export function changeTypeLabel(changeType: string): string {
  return {
    create: 'Creación',
    update: 'Actualización',
    replace: 'Reemplazo',
    upload: 'Carga inicial',
    initial_upload: 'Carga inicial al trámite',
    task_upload: 'Carga en actividad',
    new_version: 'Nueva versión',
  }[changeType] ?? changeType.replaceAll('_', ' ');
}

export type PreviewMode = 'pdf' | 'image' | 'text' | 'video' | 'audio' | 'iframe';

export function resolvePreviewMode(mimeType: string, fileName: string): PreviewMode {
  const kind = mimeTypeKind(mimeType);
  if (kind === 'pdf' || mimeType === 'application/pdf') {
    return 'pdf';
  }
  if (kind === 'image') {
    return 'image';
  }
  if (kind === 'text' || mimeType.startsWith('text/')) {
    return 'text';
  }
  if (mimeType.startsWith('video/')) {
    return 'video';
  }
  if (mimeType.startsWith('audio/')) {
    return 'audio';
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (['txt', 'csv', 'json', 'md', 'xml', 'log', 'yaml', 'yml', 'ini', 'env'].includes(extension)) {
    return 'text';
  }

  return 'iframe';
}

export function versionStatusLabel(isCurrent: boolean): string {
  return isCurrent ? 'Vigente' : 'Histórica';
}

export function scopeLabel(scope: string): string {
  return {
    case: 'Trámite',
    instance: 'Trámite',
    task: 'Actividad',
    activity: 'Actividad',
    policy: 'Política',
  }[scope] ?? scope;
}
