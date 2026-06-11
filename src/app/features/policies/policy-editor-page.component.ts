import { CommonModule } from '@angular/common';
import { Component, ElementRef, HostListener, Injector, OnDestroy, ViewChild, afterNextRender, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  ConnectionHandler,
  DoubleEllipseShape,
  Graph,
  InternalEvent,
  ShapeRegistry,
  VertexHandlerConfig,
} from '@maxgraph/core';
import { Subscription } from 'rxjs';
import { Department } from '../../core/models/admin.models';
import { Policy, PolicyCollaborator, PolicyDiagram, PolicyEdge, PolicyForm, PolicyFormCreate, PolicyFormField, PolicyFormFieldType, PolicyLane, PolicyNode, PolicyNodeType } from '../../core/models/policy.models';
import {
  createEmptyPolicyFormField,
  fieldTypeGroups,
  fieldTypeLabel,
  fieldTypeNeedsOptions,
  fieldOptionsEditorHint,
  fieldOptionsEditorTitle,
  fieldTypesByGroup,
  hydratePolicyFormField,
  serializePolicyFormFields,
  slugifyFieldName,
  validatePolicyFormFields,
} from '../../core/models/policy-form-field.config';
import { AdminService } from '../../core/services/admin.service';
import { configureMaxGraphAssets } from '../../core/config/maxgraph.config';
import { generateUUID } from '../../shared/utils/uuid.utils';
import { AuthService } from '../../core/services/auth.service';
import { EditorEvent, PolicyEditorCollaborationService } from '../../core/services/policy-editor-collaboration.service';
import { PolicyCollaboratorsModalComponent } from './policy-collaborators-modal.component';
import { PolicyEditorPresenceComponent } from './policy-editor-presence.component';
import { PolicyValidationPanelComponent } from './policy-validation-panel.component';

type ConnectorSide = 'top' | 'right' | 'bottom' | 'left';

type DiagramElementType = PolicyNodeType;
type EditorTool = 'select' | 'pan' | 'lane' | DiagramElementType | 'edge';
type DiagramExportFormat = 'png' | 'jpg' | 'svg' | 'drawio' | 'json';

class UmlFinalNodeShape extends DoubleEllipseShape {
  override paintBackground(c: any, x: number, y: number, w: number, h: number): void {
    c.ellipse(x, y, w, h);
    c.setFillColor('#ffffff');
    c.setStrokeColor('#0f172a');
    c.fillAndStroke();
  }

  override paintForeground(c: any, x: number, y: number, w: number, h: number): void {
    if (this.outline) {
      return;
    }

    const margin = this.style?.margin ?? Math.min(3 + this.strokeWidth, Math.min(w / 5, h / 5));
    const ix = x + margin;
    const iy = y + margin;
    const iw = w - 2 * margin;
    const ih = h - 2 * margin;

    if (iw > 0 && ih > 0) {
      c.ellipse(ix, iy, iw, ih);
      c.setFillColor('#0f172a');
      c.fillAndStroke();
    }
  }
}

let umlFinalShapeRegistered = false;

function registerUmlFinalShape(): void {
  if (umlFinalShapeRegistered) {
    return;
  }

  ShapeRegistry.add('umlFinal', UmlFinalNodeShape);
  umlFinalShapeRegistered = true;
}

@Component({
  selector: 'app-policy-editor-page',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PolicyCollaboratorsModalComponent, PolicyEditorPresenceComponent, PolicyValidationPanelComponent],
  templateUrl: './policy-editor-page.component.html',
  styleUrl: './policy-editor-page.component.scss',
})
export class PolicyEditorPageComponent implements OnDestroy {
  @ViewChild('graphContainer') private graphContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('fallbackStage') private fallbackStage?: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly adminService = inject(AdminService);
  private readonly authService = inject(AuthService);
  private readonly collaboration = inject(PolicyEditorCollaborationService);
  private readonly injector = inject(Injector);

  readonly policy = signal<Policy | null>(null);
  readonly departments = signal<Department[]>([]);
  readonly lanes = signal<PolicyLane[]>([]);
  readonly nodes = signal<PolicyNode[]>([]);
  readonly edges = signal<PolicyEdge[]>([]);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal('');
  readonly infoMessage = signal('Preparando editor maxGraph...');
  readonly graphReady = signal(false);
  readonly selectedCellIds = signal<string[]>([]);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly hasClipboard = signal(false);
  readonly activeTool = signal<EditorTool>('select');
  readonly edgeDraftSourceId = signal<string | null>(null);
  readonly paletteDragPreview = signal<{ clientX: number; clientY: number; tool: DiagramElementType } | null>(null);
  readonly contextMenu = signal<{ visible: boolean; x: number; y: number; cellId: string | null }>({
    visible: false,
    x: 0,
    y: 0,
    cellId: null,
  });
  readonly forms = signal<PolicyForm[]>([]);
  readonly formModalOpen = signal(false);
  readonly editingFormId = signal<string | null>(null);
  readonly formError = signal('');
  readonly openFieldTypePickerId = signal<string | null>(null);
  readonly fieldTypePickerMenuStyle = signal<{ top: string; left: string; width: string; maxHeight: string } | null>(null);
  readonly shareModalOpen = signal(false);
  readonly collaborators = signal<PolicyCollaborator[]>([]);
  readonly companyShared = computed(() => this.policy()?.company_shared === true);
  readonly showValidationPanel = signal(false);
  readonly collaborationConnected = this.collaboration.isConnected;
  readonly collaborationPresence = this.collaboration.presenceUsers;
  readonly collaborationVersion = this.collaboration.diagramVersion;
  readonly canSharePolicy = computed(() => {
    const current = this.authService.getCurrentUser();
    const policy = this.policy();
    return !!current && !!policy && policy.status === 'draft' && policy.created_by === current.id;
  });
  readonly canEditPolicy = computed(() => {
    if (this.collaboration.accessRevoked()) {
      return false;
    }

    const current = this.authService.getCurrentUser();
    const policy = this.policy();
    if (!current || !policy || policy.status !== 'draft') {
      return false;
    }

    if (policy.created_by === current.id) {
      return true;
    }

    return this.collaborators().some(
      (collaborator) => collaborator.user_id === current.id && collaborator.role === 'editor'
    );
  });
  readonly isDraft = computed(() => this.policy()?.status === 'draft');
  readonly isPublished = computed(() => this.policy()?.status === 'published');

  selectedDepartmentId = '';
  selectedNodeType: DiagramElementType = 'activity';
  selectedLaneId = '';
  nodeLabel = '';
  edgeSourceId = '';
  edgeTargetId = '';
  edgeLabel = '';
  formName = '';
  formDescription = '';
  formActivityId = '';
  formFields: PolicyFormField[] = [];

  readonly availableDepartments = computed(() =>
    this.departments().filter((department) => !this.lanes().some((lane) => lane.department_id === department.id))
  );
  readonly selectedSummary = computed(() => {
    const ids = new Set(this.selectedCellIds());
    return {
      lanes: this.lanes().filter((lane) => ids.has(lane.id)),
      nodes: this.nodes().filter((node) => ids.has(node.id)),
      edges: this.edges().filter((edge) => ids.has(edge.id)),
    };
  });
  readonly selectedEntity = computed<
    | { kind: 'lane'; item: PolicyLane }
    | { kind: 'node'; item: PolicyNode }
    | { kind: 'edge'; item: PolicyEdge }
    | null
  >(() => {
    const firstId = this.selectedCellIds()[0];
    if (!firstId) {
      return null;
    }

    const lane = this.lanes().find((item) => item.id === firstId);
    if (lane) return { kind: 'lane', item: lane };
    const node = this.nodes().find((item) => item.id === firstId);
    if (node) return { kind: 'node', item: node };
    const edge = this.edges().find((item) => item.id === firstId);
    if (edge) return { kind: 'edge', item: edge };
    return null;
  });
  readonly metadataItems = computed(() => {
    const current = this.policy();
    if (!current) {
      return [];
    }

    return [
      { label: 'Categoría', value: current.category },
      { label: 'Creado por', value: current.created_by_name },
        { label: 'Notación', value: `${current.diagram.notation} ${current.diagram.uml_version}` },
        { label: 'Editor', value: String(current.diagram.metadata['editor'] ?? 'maxgraph') },
        { label: 'Formularios', value: `${this.forms().length}` },
      ];
  });
  readonly formFieldTypeGroups = fieldTypeGroups();

  fieldTypeLabel = fieldTypeLabel;
  fieldTypeNeedsOptions = fieldTypeNeedsOptions;
  fieldOptionsEditorTitle = fieldOptionsEditorTitle;
  fieldOptionsEditorHint = fieldOptionsEditorHint;
  fieldTypesByGroup = fieldTypesByGroup;
  readonly activityNodes = computed(() => this.nodes().filter((node) => node.type === 'activity'));
  readonly formsBySelectedActivity = computed(() => {
    const selected = this.selectedEntity();
    const activityId = selected?.kind === 'node' && selected.item.type === 'activity' ? selected.item.id : null;
    return activityId ? this.forms().filter((form) => form.activity_id === activityId) : [];
  });
  readonly fallbackSvgEdges = computed(() =>
    this.edges()
      .map((edge) => {
        const source = this.nodes().find((node) => node.id === edge.source_id);
        const target = this.nodes().find((node) => node.id === edge.target_id);
        if (!source || !target) {
          return null;
        }

        return {
          ...edge,
          x1: source.x + source.width,
          y1: source.y + source.height / 2,
          x2: target.x,
          y2: target.y + target.height / 2,
          tx: (source.x + source.width + target.x) / 2,
          ty: (source.y + source.height / 2 + target.y + target.height / 2) / 2 - 8,
        };
      })
      .filter((edge): edge is NonNullable<typeof edge> => !!edge)
  );

  private graph?: Graph;
  private readonly laneCells = new Map<string, any>();
  private readonly nodeCells = new Map<string, any>();
  private readonly edgeCells = new Map<string, any>();
  private readonly laneContentSizes = signal<Map<string, { height: number }>>(new Map());
  private graphInitialized = false;
  private policyId = '';
  private renderInProgress = false;
  private syncTimeout: ReturnType<typeof setTimeout> | null = null;
  private history: Array<{ lanes: PolicyLane[]; nodes: PolicyNode[]; edges: PolicyEdge[] }> = [];
  private historyIndex = -1;
  private clipboard: { nodes: PolicyNode[]; edges: PolicyEdge[] } | null = null;
  private dragState: { nodeId: string; startMouseX: number; startMouseY: number; originX: number; originY: number } | null = null;
  private canvasPanState: {
    startClientX: number;
    startClientY: number;
    originTranslateX: number;
    originTranslateY: number;
  } | null = null;
  private connectionOverlayRefreshScheduled = false;
  private connectionOverlayRoot: HTMLDivElement | null = null;
  private connectionOverlayObserver: MutationObserver | null = null;
  private connectionTargetHighlightEl: HTMLDivElement | null = null;
  private connectionTargetHighlightId: string | null = null;
  private connectionPreviewSvg: SVGSVGElement | null = null;
  private connectionPreviewLineEl: SVGLineElement | null = null;
  private connectionDragState: {
    sourceId: string;
    sourceSide: ConnectorSide;
    startOverlayX: number;
    startOverlayY: number;
  } | null = null;
  private paletteDragState: {
    tool: DiagramElementType;
    startClientX: number;
    startClientY: number;
    dragging: boolean;
  } | null = null;
  private collaborationEventsSub: Subscription | null = null;
  private collaborationBroadcastTimeout: ReturnType<typeof setTimeout> | null = null;
  private collaborationReconnectTimer: ReturnType<typeof setInterval> | null = null;
  private remoteSyncInProgress = false;
  private suppressNextCanvasClick = false;
  private static readonly PALETTE_DRAG_THRESHOLD = 4;
  private static readonly CONNECTOR_SIDES: ConnectorSide[] = ['top', 'right', 'bottom', 'left'];

  constructor() {
    const policyId = this.route.snapshot.paramMap.get('id');
    if (!policyId) {
      this.error.set('Política inválida');
      this.loading.set(false);
      return;
    }

    this.policyId = policyId;
    this.loadData();

    effect(() => {
      const canEdit = this.canEditPolicy();
      if (this.graphInitialized && this.graph) {
        this.applyReadOnlyMode(canEdit);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }
    if (this.collaborationBroadcastTimeout) {
      clearTimeout(this.collaborationBroadcastTimeout);
    }
    if (this.collaborationReconnectTimer) {
      clearInterval(this.collaborationReconnectTimer);
    }
    this.collaborationEventsSub?.unsubscribe();
    this.collaboration.disconnect();
    this.destroyConnectionOverlay();
    this.graph?.destroy();
  }

  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;

    if (isTyping) {
      return;
    }

    const ctrlOrMeta = event.ctrlKey || event.metaKey;

    if (ctrlOrMeta && event.key.toLowerCase() === 'z' && !event.shiftKey) {
      event.preventDefault();
      this.undo();
      return;
    }

    if ((ctrlOrMeta && event.key.toLowerCase() === 'y') || (ctrlOrMeta && event.shiftKey && event.key.toLowerCase() === 'z')) {
      event.preventDefault();
      this.redo();
      return;
    }

    if (ctrlOrMeta && event.key.toLowerCase() === 'c') {
      event.preventDefault();
      this.copySelection();
      return;
    }

    if (ctrlOrMeta && event.key.toLowerCase() === 'x') {
      event.preventDefault();
      this.cutSelection();
      return;
    }

    if (ctrlOrMeta && event.key.toLowerCase() === 'v') {
      event.preventDefault();
      this.pasteClipboard();
      return;
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      this.deleteSelection();
    }
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.contextMenu().visible) {
      this.closeContextMenu();
    }
    if (this.openFieldTypePickerId()) {
      this.closeFieldTypePicker();
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onWindowMouseMove(event: MouseEvent): void {
    if (this.connectionDragState) {
      const targetId = this.resolveTargetConnectableAtClientPoint(
        event.clientX,
        event.clientY,
        this.connectionDragState.sourceId
      );
      this.updateConnectionTargetHighlight(targetId);

      let end = this.getViewPointFromClient(event.clientX, event.clientY);
      if (targetId) {
        const targetCell = this.getConnectableCell(targetId);
        if (targetCell) {
          const side = this.closestSideForCell(targetCell, event.clientX, event.clientY);
          end = this.getConnectableSidePoint(targetId, side) ?? end;
        }
      }

      this.updateConnectionPreview(
        this.connectionDragState.startOverlayX,
        this.connectionDragState.startOverlayY,
        end.x,
        end.y,
        !!targetId
      );
      return;
    }

    if (this.paletteDragState) {
      const dx = Math.abs(event.clientX - this.paletteDragState.startClientX);
      const dy = Math.abs(event.clientY - this.paletteDragState.startClientY);
      if (!this.paletteDragState.dragging && (dx > PolicyEditorPageComponent.PALETTE_DRAG_THRESHOLD || dy > PolicyEditorPageComponent.PALETTE_DRAG_THRESHOLD)) {
        this.paletteDragState.dragging = true;
      }

      if (this.paletteDragState.dragging) {
        this.paletteDragPreview.set({
          clientX: event.clientX,
          clientY: event.clientY,
          tool: this.paletteDragState.tool,
        });
      }
      return;
    }

    if (this.canvasPanState && this.graphReady()) {
      this.updateCanvasPan(event);
      return;
    }

    if (!this.dragState || this.graphReady()) {
      return;
    }

    const stage = this.fallbackStage?.nativeElement;
    if (!stage) {
      return;
    }

    const deltaX = event.clientX - this.dragState.startMouseX;
    const deltaY = event.clientY - this.dragState.startMouseY;
    const nextX = Math.max(220, this.dragState.originX + deltaX);
    const nextY = Math.max(24, this.dragState.originY + deltaY);

    this.nodes.set(
      this.nodes().map((node) =>
        node.id === this.dragState!.nodeId
          ? {
              ...node,
              x: nextX,
              y: nextY,
            }
          : node
      )
    );
  }

  @HostListener('window:mouseup', ['$event'])
  onWindowMouseUp(event: MouseEvent): void {
    if (this.connectionDragState) {
      this.finishConnectionDrag(event);
      return;
    }

    if (this.paletteDragState) {
      this.finishPaletteDrag(event);
      return;
    }

    if (this.canvasPanState) {
      const moved =
        Math.abs(event.clientX - this.canvasPanState.startClientX) > 3 ||
        Math.abs(event.clientY - this.canvasPanState.startClientY) > 3;

      if (!moved && this.activeTool() === 'select') {
        this.graph?.clearSelection();
        this.selectedCellIds.set([]);
      }

      this.canvasPanState = null;
      return;
    }

    if (!this.dragState) {
      return;
    }

    this.dragState = null;
    this.pushHistorySnapshot();
  }

  addLane(): void {
    if (!this.ensureCanEdit('agregar calles')) {
      return;
    }

    const department = this.departments().find((item) => item.id === this.selectedDepartmentId);
    if (!department) {
      this.infoMessage.set('Selecciona un departamento para crear la calle.');
      return;
    }

    const lane: PolicyLane = {
      id: `lane-${generateUUID()}`,
      department_id: department.id,
      department_name: department.name,
    };

    this.lanes.set([...this.lanes(), lane]);
    this.selectedDepartmentId = '';
    this.infoMessage.set(`Calle agregada para ${department.name}.`);
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  setTool(tool: EditorTool): void {
    if (!this.canEditPolicy() && tool !== 'select' && tool !== 'pan') {
      this.infoMessage.set('No tienes permiso para editar.');
      return;
    }

    this.activeTool.set(tool);
    this.edgeDraftSourceId.set(null);
    const labels: Record<EditorTool, string> = {
      select: 'Selección',
      pan: 'Desplazar',
      lane: 'Calle',
      initial: 'Nodo inicial',
      activity: 'Actividad',
      decision: 'Decisión',
      fork: 'Fork',
      join: 'Join',
      final: 'Nodo final',
      edge: 'Flujo',
    };
    this.applyInteractionMode();
    if (this.isInsertableNodeTool(tool)) {
      this.infoMessage.set(`Herramienta activa: ${labels[tool]}. Arrastra al lienzo o haz clic donde quieras colocarlo.`);
      return;
    }
    this.infoMessage.set(`Herramienta activa: ${labels[tool]}.`);
  }

  onPaletteToolPointerDown(tool: DiagramElementType, event: MouseEvent): void {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.setTool(tool);
    this.paletteDragState = {
      tool,
      startClientX: event.clientX,
      startClientY: event.clientY,
      dragging: false,
    };
  }

  palettePreviewIconClass(tool: DiagramElementType): string {
    return `uml-icon uml-icon--${tool}`;
  }

  connectionHandleArrow(side: ConnectorSide): string {
    if (side === 'top') return '↑';
    if (side === 'right') return '→';
    if (side === 'bottom') return '↓';
    return '←';
  }

  onConnectionHandlePointerDown(side: ConnectorSide, event: MouseEvent): void {
    if (event.button !== 0 || !this.graph || this.activeTool() !== 'select') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const sourceId = this.getSingleSelectedConnectableId();
    if (!sourceId) {
      return;
    }

    const cell = this.getConnectableCell(sourceId);
    if (!cell) {
      return;
    }

    const anchor = this.getConnectableSidePoint(sourceId, side);
    if (!anchor) {
      return;
    }

    this.connectionDragState = {
      sourceId,
      sourceSide: side,
      startOverlayX: anchor.x,
      startOverlayY: anchor.y,
    };
    this.renderConnectionHandles([]);
    this.updateConnectionPreview(anchor.x, anchor.y, anchor.x, anchor.y);
    document.body.style.cursor = 'crosshair';
    this.infoMessage.set('Arrastra hasta otro nodo o calle y suelta para crear el flujo.');
  }

  addNode(): void {
    if (!this.ensureCanEdit('agregar nodos')) {
      return;
    }

    const type = this.selectedNodeType;
    if (this.requiresLane(type) && !this.selectedLaneId) {
      this.infoMessage.set('Selecciona una calle para insertar el nodo UML.');
      return;
    }
    if (type === 'initial' && this.nodes().some((node) => node.type === 'initial')) {
      this.infoMessage.set('Solo puede existir un nodo inicial.');
      return;
    }

    const laneIndex = this.lanes().findIndex((lane) => lane.id === this.selectedLaneId);
    const laneTop = laneIndex >= 0 ? this.laneY(laneIndex) : 24;
    const node: PolicyNode = {
      id: `node-${generateUUID()}`,
      type,
      label: this.nodeLabel.trim(),
      lane_id: this.requiresLane(type) ? this.selectedLaneId || null : null,
      x: 260 + this.nodes().filter((item) => item.lane_id === (this.selectedLaneId || null)).length * 190,
      y: laneTop + (this.requiresLane(type) ? 46 : 0),
      width: this.nodeWidth(type),
      height: this.nodeHeight(type),
      metadata: {},
    };

    this.nodes.set([...this.nodes(), node]);
    this.nodeLabel = '';
    this.infoMessage.set(`Elemento ${this.nodeTypeLabel(type)} agregado.`);
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  addEdge(): void {
    if (!this.edgeSourceId || !this.edgeTargetId) {
      this.infoMessage.set('Selecciona nodo origen y destino.');
      return;
    }
    if (this.edgeSourceId === this.edgeTargetId) {
      this.infoMessage.set('El origen y el destino no pueden ser el mismo nodo.');
      return;
    }

    const edge: PolicyEdge = {
      id: `edge-${generateUUID()}`,
      source_id: this.edgeSourceId,
      target_id: this.edgeTargetId,
      label: this.edgeLabel.trim(),
      metadata: {},
    };

    this.edges.set([...this.edges(), edge]);
    this.edgeLabel = '';
    this.infoMessage.set('Flujo agregado.');
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  onFallbackStageClick(event: MouseEvent): void {
    if (this.graphReady()) {
      return;
    }

    const stage = this.fallbackStage?.nativeElement;
    if (!stage) {
      return;
    }

    const rect = stage.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const tool = this.activeTool();

    if (tool === 'select') {
      this.selectedCellIds.set([]);
      return;
    }

    if (tool === 'lane') {
      this.createLaneAtPoint(y);
      return;
    }

    if (tool === 'edge') {
      this.infoMessage.set('Selecciona dos nodos para crear un flujo.');
      return;
    }

    if (tool === 'pan') {
      return;
    }

    this.createNodeAtPoint(tool, x, y, this.resolveLaneIdFromPoint(y));
  }

  onFallbackNodeClick(node: PolicyNode, event: MouseEvent): void {
    event.stopPropagation();

    if (this.activeTool() === 'edge') {
      this.handleEdgeToolClick({ getId: () => node.id });
      return;
    }

    this.selectCells([node.id]);
  }

  onFallbackNodePointerDown(node: PolicyNode, event: MouseEvent): void {
    if (this.graphReady() || this.activeTool() !== 'select') {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.selectCells([node.id]);
    this.dragState = {
      nodeId: node.id,
      startMouseX: event.clientX,
      startMouseY: event.clientY,
      originX: node.x,
      originY: node.y,
    };
  }

  onFallbackLaneClick(lane: PolicyLane, event: MouseEvent): void {
    event.stopPropagation();
    this.selectCells([lane.id]);
  }

  openContextMenuFor(cellId: string, event: MouseEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.selectCells([cellId]);
    this.contextMenu.set({ visible: true, x: event.clientX, y: event.clientY, cellId });
  }

  removeLane(laneId: string): void {
    this.lanes.set(this.lanes().filter((lane) => lane.id !== laneId));
    const deletedNodeIds = this.nodes().filter((node) => node.lane_id === laneId).map((node) => node.id);
    this.nodes.set(this.nodes().filter((node) => node.lane_id !== laneId));
    this.edges.set(this.edges().filter((edge) => !deletedNodeIds.includes(edge.source_id) && !deletedNodeIds.includes(edge.target_id)));
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  removeNode(nodeId: string): void {
    this.nodes.set(this.nodes().filter((node) => node.id !== nodeId));
    this.edges.set(this.edges().filter((edge) => edge.source_id !== nodeId && edge.target_id !== nodeId));
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  removeEdge(edgeId: string): void {
    this.edges.set(this.edges().filter((edge) => edge.id !== edgeId));
    this.pushHistorySnapshot();
    this.renderGraph();
  }

  autoLayout(): void {
    if (!this.ensureCanEdit('reordenar el diagrama')) {
      return;
    }

    this.syncGraphBackToState();

    const nodesById = new Map(this.nodes().map((node) => [node.id, node]));
    const validNodeIds = new Set(this.nodes().map((node) => node.id));

    const cleanEdges = this.edges().filter(
      (edge) => validNodeIds.has(edge.source_id) && validNodeIds.has(edge.target_id) && edge.source_id !== edge.target_id,
    );

    const outgoing = new Map<string, string[]>();
    const incoming = new Map<string, string[]>();
    for (const edge of cleanEdges) {
      outgoing.set(edge.source_id, [...(outgoing.get(edge.source_id) ?? []), edge.target_id]);
      incoming.set(edge.target_id, [...(incoming.get(edge.target_id) ?? []), edge.source_id]);
    }

    const initialNode = this.nodes().find((node) => node.type === 'initial');
    if (!initialNode) {
      this.infoMessage.set('El diagrama no tiene nodo inicial para reordenar.');
      return;
    }

    const column = new Map<string, number>();
    column.set(initialNode.id, 0);

    const queue: string[] = [initialNode.id];
    const visited = new Set<string>([initialNode.id]);

    while (queue.length) {
      const currentId = queue.shift()!;
      const currentCol = column.get(currentId)!;
      for (const nextId of outgoing.get(currentId) ?? []) {
        if (!validNodeIds.has(nextId)) {
          continue;
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push(nextId);
        }
        if (!column.has(nextId) || column.get(nextId)! < currentCol + 1) {
          column.set(nextId, currentCol + 1);
        }
      }
    }

    for (const node of this.nodes()) {
      if (!column.has(node.id)) {
        column.set(node.id, 0);
      }
    }

    for (const node of this.nodes()) {
      if (node.type === 'join') {
        const joinIn = incoming.get(node.id) ?? [];
        const joinCols = joinIn.map((id) => column.get(id) ?? 0).filter((c) => c > 0);
        if (joinCols.length > 0) {
          column.set(node.id, Math.max(...joinCols) + 1);
        }
      }
    }

    const propagated = new Set<string>();
    const propagateQueue: string[] = [];
    for (const node of this.nodes()) {
      if (node.type === 'join') {
        propagateQueue.push(node.id);
      }
    }
    while (propagateQueue.length) {
      const curId = propagateQueue.shift()!;
      if (propagated.has(curId)) continue;
      propagated.add(curId);
      const baseCol = column.get(curId)!;
      for (const nextId of outgoing.get(curId) ?? []) {
        if (!validNodeIds.has(nextId)) continue;
        const prevCol = column.get(nextId) ?? 0;
        const newCol = baseCol + 1;
        if (newCol > prevCol) {
          column.set(nextId, newCol);
        }
        propagateQueue.push(nextId);
      }
    }

    const COLUMN_SPACING = 160;
    const LANE_GAP = 1;
    const MIN_LANE_HEIGHT = 100;
    const NODE_VERTICAL_PADDING = 34;

    const inferredLaneByNodeId = new Map<string, string | null>();
    for (const node of this.nodes()) {
      inferredLaneByNodeId.set(node.id, this.inferAutoLayoutLaneId(node, nodesById, incoming, outgoing));
    }

    const populatedLaneIds = new Set(
      [...inferredLaneByNodeId.values()].filter((laneId): laneId is string => !!laneId),
    );
    const laneToIndex = new Map(this.lanes().map((lane, index) => [lane.id, index]));
    const keptLanes = this.lanes()
      .filter((lane) => populatedLaneIds.has(lane.id))
      .sort((a, b) => (laneToIndex.get(a.id) ?? 0) - (laneToIndex.get(b.id) ?? 0));

    const rawNodes = this.nodes()
      .filter((node) => {
        const laneId = inferredLaneByNodeId.get(node.id);
        return !laneId || populatedLaneIds.has(laneId);
      })
      .map((node) => {
        const col = column.get(node.id) ?? 0;
        const x = 60 + col * COLUMN_SPACING;
        const laneId = inferredLaneByNodeId.get(node.id);
        const laneBaseY = laneId ? 24 : 24;
        return {
          ...node,
          lane_id: laneId,
          _col: col,
          _baseY: laneBaseY,
          x,
          y: laneBaseY + NODE_VERTICAL_PADDING,
        };
      });

    type LayoutNode = typeof rawNodes[number];

    const groupKey = (node: LayoutNode) => node.lane_id
      ? `${node.lane_id}:${node._col}`
      : `:${node._col}`;

    const groups = new Map<string, LayoutNode[]>();
    for (const node of rawNodes) {
      const key = groupKey(node);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(node);
    }

    for (const group of groups.values()) {
      if (group.length < 2) {
        continue;
      }
      group.sort((a, b) => {
        const aOut = (outgoing.get(a.id) ?? []).length;
        const bOut = (outgoing.get(b.id) ?? []).length;
        return aOut - bOut;
      });
      let offset = 0;
      for (let i = 1; i < group.length; i++) {
        offset += group[i - 1].height + 14;
        group[i].y += offset;
      }
    }

    const contentHeights = new Map<string, number>();
    for (const lane of keptLanes) {
      const laneNodes = rawNodes.filter((node) => node.lane_id === lane.id);
      let nodeBottom = 0;
      for (const node of laneNodes) {
        nodeBottom = Math.max(nodeBottom, node.y + node.height - 24 + 8);
      }
      contentHeights.set(lane.id, Math.max(MIN_LANE_HEIGHT, nodeBottom + 12));
    }

    const laneBaseY = new Map<string, number>();
    let currentY = 24;
    for (const lane of keptLanes) {
      laneBaseY.set(lane.id, currentY);
      currentY += (contentHeights.get(lane.id) ?? MIN_LANE_HEIGHT) + LANE_GAP;
    }

    const sizes = new Map<string, { height: number }>();
    for (const [id, height] of contentHeights) {
      sizes.set(id, { height });
    }
    this.laneContentSizes.set(sizes);

    const updatedNodes = rawNodes.map((node) => {
      const final: any = { ...node };
      delete final._col;
      delete final._baseY;

      if (node.lane_id) {
        final.y = (laneBaseY.get(node.lane_id) ?? 24) + (node.y - 24);
      } else {
        final.y = 84;
      }

      return final as PolicyNode;
    });

    this.lanes.set(keptLanes);
    this.nodes.set(updatedNodes);
    this.pushHistorySnapshot(true);
    this.renderGraph();
    this.infoMessage.set('Diagrama reordenado automáticamente.');
  }

  private inferAutoLayoutLaneId(
    node: PolicyNode,
    nodesById: Map<string, PolicyNode>,
    incoming: Map<string, string[]>,
    outgoing: Map<string, string[]>
  ): string | null {
    if (node.lane_id) {
      return node.lane_id;
    }

    const incomingLane = (incoming.get(node.id) ?? [])
      .map((sourceId) => nodesById.get(sourceId)?.lane_id ?? null)
      .find((laneId): laneId is string => !!laneId);
    const outgoingLane = (outgoing.get(node.id) ?? [])
      .map((targetId) => nodesById.get(targetId)?.lane_id ?? null)
      .find((laneId): laneId is string => !!laneId);

    if (node.type === 'initial' && outgoingLane) {
      return outgoingLane;
    }

    if (node.type === 'final' && incomingLane) {
      return incomingLane;
    }

    if (node.type === 'fork' || node.type === 'join' || node.type === 'decision') {
      if (incomingLane) {
        return incomingLane;
      }
      if (outgoingLane) {
        return outgoingLane;
      }
    }

    if (incomingLane) {
      return incomingLane;
    }

    if (outgoingLane) {
      return outgoingLane;
    }

    if (node.type === 'initial') {
      return this.lanes()[0]?.id ?? null;
    }

    if (node.type === 'final') {
      return this.lanes()[this.lanes().length - 1]?.id ?? null;
    }

    return null;
  }

  zoomIn(): void {
    this.graph?.zoomIn();
  }

  zoomOut(): void {
    this.graph?.zoomOut();
  }

  exportDiagramImage(): void {
    this.exportDiagramAs('png');
    return;

    const svg = this.buildDiagramSvgForExport()!;
    if (!svg) {
      this.infoMessage.set('No hay diagrama para exportar.');
      return;
    }

    const fileBase = this.safeFileName(this.policy()?.name || 'politica');
    const blob = new Blob([svg.content], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = svg.width * scale;
      canvas.height = svg.height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        this.downloadBlob(blob, `${fileBase}.svg`);
        this.infoMessage.set('No se pudo generar PNG; se descargó SVG.');
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (!pngBlob) {
          this.downloadBlob(blob, `${fileBase}.svg`);
          this.infoMessage.set('No se pudo generar PNG; se descargó SVG.');
          return;
        }
        this.downloadBlob(pngBlob, `${fileBase}.png`);
        this.infoMessage.set('Imagen del diagrama exportada.');
      }, 'image/png');
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      this.downloadBlob(blob, `${fileBase}.svg`);
      this.infoMessage.set('No se pudo generar PNG; se descargó SVG.');
    };

    image.src = url;
  }

  exportDiagramFormatFromEvent(event: Event): void {
    const select = event.target as HTMLSelectElement | null;
    const format = select?.value as DiagramExportFormat | undefined;
    if (!select || !format) {
      return;
    }

    this.exportDiagramAs(format);
    select.value = '';
  }

  exportDiagramAs(format: DiagramExportFormat): void {
    const svg = this.buildDiagramSvgForExport();
    if (!svg) {
      this.infoMessage.set('No hay diagrama para exportar.');
      return;
    }

    const fileBase = this.safeFileName(this.policy()?.name || 'politica');
    const svgBlob = new Blob([svg.content], { type: 'image/svg+xml;charset=utf-8' });

    if (format === 'svg') {
      this.downloadBlob(svgBlob, `${fileBase}.svg`);
      this.infoMessage.set('Diagrama exportado en SVG.');
      return;
    }

    if (format === 'drawio') {
      this.downloadBlob(
        new Blob([this.buildDrawioXmlForExport()], { type: 'application/vnd.jgraph.mxfile;charset=utf-8' }),
        `${fileBase}.drawio`
      );
      this.infoMessage.set('Diagrama exportado para draw.io.');
      return;
    }

    if (format === 'json') {
      this.downloadBlob(
        new Blob([JSON.stringify(this.buildDiagramExportModel(), null, 2)], { type: 'application/json;charset=utf-8' }),
        `${fileBase}.json`
      );
      this.infoMessage.set('Modelo del diagrama exportado en JSON.');
      return;
    }

    this.exportSvgRaster(svg, svgBlob, fileBase, format);
  }

  private exportSvgRaster(
    svg: { content: string; width: number; height: number },
    svgBlob: Blob,
    fileBase: string,
    format: 'png' | 'jpg'
  ): void {
    const url = URL.createObjectURL(svgBlob);
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = 2;
      canvas.width = svg.width * scale;
      canvas.height = svg.height * scale;
      const context = canvas.getContext('2d');
      if (!context) {
        URL.revokeObjectURL(url);
        this.downloadBlob(svgBlob, `${fileBase}.svg`);
        this.infoMessage.set('No se pudo generar imagen; se descargó SVG.');
        return;
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      const mimeType = format === 'jpg' ? 'image/jpeg' : 'image/png';
      canvas.toBlob((rasterBlob) => {
        if (!rasterBlob) {
          this.downloadBlob(svgBlob, `${fileBase}.svg`);
          this.infoMessage.set('No se pudo generar imagen; se descargó SVG.');
          return;
        }
        this.downloadBlob(rasterBlob, `${fileBase}.${format}`);
        this.infoMessage.set(`Diagrama exportado en ${format.toUpperCase()}.`);
      }, mimeType, 0.92);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      this.downloadBlob(svgBlob, `${fileBase}.svg`);
      this.infoMessage.set('No se pudo generar imagen; se descargó SVG.');
    };

    image.src = url;
  }

  copySelection(): void {
    if (!this.ensureCanEdit('copiar elementos')) {
      return;
    }

    this.syncGraphBackToState();
    const ids = new Set(this.selectedCellIds());
    const nodes = this.nodes().filter((node) => ids.has(node.id));
    const nodeIds = new Set(nodes.map((node) => node.id));
    const edges = this.edges().filter((edge) => ids.has(edge.id) || (nodeIds.has(edge.source_id) && nodeIds.has(edge.target_id)));

    if (!nodes.length && !edges.length) {
      this.infoMessage.set('Selecciona nodos o flujos para copiar.');
      return;
    }

    this.clipboard = {
      nodes: structuredClone(nodes),
      edges: structuredClone(edges),
    };
    this.hasClipboard.set(true);
    this.infoMessage.set('Selección copiada.');
  }

  cutSelection(): void {
    if (!this.ensureCanEdit('cortar elementos')) {
      return;
    }

    this.copySelection();
    if (this.clipboard) {
      this.deleteSelection();
      this.infoMessage.set('Selección cortada.');
    }
  }

  pasteClipboard(): void {
    if (!this.ensureCanEdit('pegar elementos')) {
      return;
    }

    if (!this.clipboard) {
      this.infoMessage.set('No hay elementos copiados.');
      return;
    }

    const idMap = new Map<string, string>();
    const clonedNodes = this.clipboard.nodes.map((node) => {
      const newId = `node-${generateUUID()}`;
      idMap.set(node.id, newId);
      return {
        ...structuredClone(node),
        id: newId,
        x: node.x + 40,
        y: node.y + 40,
      };
    });

    const clonedEdges = this.clipboard.edges
      .filter((edge) => idMap.has(edge.source_id) && idMap.has(edge.target_id))
      .map((edge) => ({
        ...structuredClone(edge),
        id: `edge-${generateUUID()}`,
        source_id: idMap.get(edge.source_id)!,
        target_id: idMap.get(edge.target_id)!,
      }));

    this.nodes.set([...this.nodes(), ...clonedNodes]);
    this.edges.set([...this.edges(), ...clonedEdges]);
    this.selectedCellIds.set([...clonedNodes.map((node) => node.id), ...clonedEdges.map((edge) => edge.id)]);
    this.pushHistorySnapshot();
    this.renderGraph();
    this.infoMessage.set('Elementos pegados.');
  }

  deleteSelection(): void {
    if (!this.ensureCanEdit('eliminar elementos')) {
      return;
    }

    const ids = new Set(this.selectedCellIds());
    if (!ids.size) {
      this.infoMessage.set('No hay elementos seleccionados.');
      return;
    }

    const laneIds = new Set(this.lanes().filter((lane) => ids.has(lane.id)).map((lane) => lane.id));
    const nodeIds = new Set(this.nodes().filter((node) => ids.has(node.id) || (node.lane_id && laneIds.has(node.lane_id))).map((node) => node.id));

    this.lanes.set(this.lanes().filter((lane) => !ids.has(lane.id)));
    this.nodes.set(this.nodes().filter((node) => !nodeIds.has(node.id)));
    this.edges.set(this.edges().filter((edge) => !ids.has(edge.id) && !nodeIds.has(edge.source_id) && !nodeIds.has(edge.target_id)));
    this.selectedCellIds.set([]);
    this.pushHistorySnapshot();
    this.renderGraph();
    this.infoMessage.set('Selección eliminada.');
  }

  undo(): void {
    if (!this.ensureCanEdit('deshacer cambios')) {
      return;
    }

    if (!this.canUndo()) {
      this.infoMessage.set('No hay cambios para deshacer.');
      return;
    }

    this.historyIndex -= 1;
    this.restoreHistorySnapshot();
    this.scheduleCollaborationBroadcast();
    this.infoMessage.set('Cambio deshecho.');
  }

  redo(): void {
    if (!this.ensureCanEdit('rehacer cambios')) {
      return;
    }

    if (!this.canRedo()) {
      this.infoMessage.set('No hay cambios para rehacer.');
      return;
    }

    this.historyIndex += 1;
    this.restoreHistorySnapshot();
    this.scheduleCollaborationBroadcast();
    this.infoMessage.set('Cambio rehecho.');
  }

  saveDiagram(): void {
    if (!this.ensureCanEdit('guardar el diagrama')) {
      return;
    }

    const current = this.policy();
    if (!current || this.saving()) {
      return;
    }

    this.syncGraphBackToState();
    const diagramForSave = this.buildDiagramForSave();
    const body: PolicyDiagram = {
      ...current.diagram,
      lanes: diagramForSave.lanes,
      nodes: diagramForSave.nodes,
      edges: diagramForSave.edges,
      forms: diagramForSave.forms,
      metadata: {
        ...current.diagram.metadata,
        editor: 'maxgraph',
        allowed_subset: 'uml_activity_swimlane',
      },
      source_xml: null,
    };

    this.saving.set(true);
    this.error.set('');
    this.adminService.updatePolicyDiagram(this.policyId, body).subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.lanes.set(policy.diagram.lanes);
        this.nodes.set(policy.diagram.nodes);
        this.edges.set(policy.diagram.edges);
        this.saving.set(false);
        this.infoMessage.set('Diagrama guardado correctamente.');
        this.renderGraph();
        this.broadcastDiagramUpdate();
      },
      error: (error) => {
        this.saving.set(false);
        this.error.set(error?.error?.detail ?? 'No se pudo guardar el diagrama');
      },
    });
  }

  private buildDiagramForSave(): Pick<PolicyDiagram, 'lanes' | 'nodes' | 'edges' | 'forms'> {
    const validDepartmentIds = new Set(this.departments().map((department) => department.id));
    const lanes = this.lanes()
      .map((lane) => {
        if (validDepartmentIds.has(lane.department_id)) {
          return lane;
        }

        const matchingDepartment = this.resolveDepartmentForLaneName(lane.department_name);
        return matchingDepartment
          ? { ...lane, department_id: matchingDepartment.id, department_name: matchingDepartment.name }
          : lane;
      })
      .filter((lane) => validDepartmentIds.has(lane.department_id));
    const laneIds = new Set(lanes.map((lane) => lane.id));
    const fallbackLaneId = lanes[0]?.id ?? null;
    const nodes = this.nodes().map((node) => {
      if (node.type === 'initial' || node.type === 'final') {
        return { ...node, lane_id: null };
      }

      if (node.type === 'activity' && !node.lane_id) {
        return { ...node, lane_id: fallbackLaneId };
      }

      if (node.lane_id && !laneIds.has(node.lane_id)) {
        return { ...node, lane_id: node.type === 'activity' ? fallbackLaneId : null };
      }

      return node;
    });

    return {
      lanes,
      nodes,
      edges: this.edges(),
      forms: this.forms(),
    };
  }

  private normalizeDepartmentName(value: string): string {
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim()
      .toLowerCase();
  }

  private resolveDepartmentForLaneName(laneName: string): Department | null {
    const normalizedLaneName = this.normalizeDepartmentName(laneName);
    const exact = this.departments().find((department) => this.normalizeDepartmentName(department.name) === normalizedLaneName);
    if (exact) {
      return exact;
    }

    const aliases: Record<string, string[]> = {
      'Direccion General': ['direccion', 'direccion general', 'gerencia'],
      Operaciones: ['operaciones', 'registro', 'registrar', 'tramite'],
      'Atencion al Cliente': ['atencion al cliente', 'mesa de entradas', 'recepcion', 'cliente', 'ciudadano'],
      'Recursos Humanos': ['recursos humanos', 'rrhh', 'personal', 'nomina'],
      Tesoreria: ['tesoreria', 'finanzas', 'contabilidad', 'pago', 'presupuesto'],
      'Compras y Contrataciones': ['compras', 'contrataciones', 'adquisiciones', 'proveedor', 'logistica'],
      'Tecnologia de la Informacion': ['tecnologia', 'tecnologia de la informacion', 'ti', 'sistemas'],
      'Asesoria Legal': ['asesoria legal', 'legal', 'juridica', 'contrato'],
      'Infraestructura y Mantenimiento': ['infraestructura', 'mantenimiento', 'instalaciones'],
      'Archivo y Documentacion': ['archivo', 'archivo central', 'documentacion', 'documental', 'expediente'],
      'Control Interno': ['control interno', 'auditoria', 'cumplimiento'],
    };

    for (const department of this.departments()) {
      const departmentAliases = aliases[department.name] ?? [];
      if (departmentAliases.some((alias) => this.normalizeDepartmentName(alias) === normalizedLaneName)) {
        return department;
      }
    }

    return null;
  }

  renameContextCell(): void {
    if (!this.findContextTarget()) {
      return;
    }
    this.infoMessage.set('Edita las propiedades del elemento desde el panel lateral.');
    this.closeContextMenu();
  }

  duplicateContextCell(): void {
    if (!this.ensureCanEdit('duplicar elementos')) {
      this.closeContextMenu();
      return;
    }

    const target = this.findContextTarget();
    if (!target) {
      return;
    }

    if (target.kind === 'lane') {
      this.infoMessage.set('La duplicación de calles no está habilitada en esta etapa.');
      this.closeContextMenu();
      return;
    }

    if (target.kind === 'node') {
      const copy: PolicyNode = {
        ...structuredClone(target.item),
        id: `node-${generateUUID()}`,
        x: target.item.x + 40,
        y: target.item.y + 40,
      };
      this.nodes.set([...this.nodes(), copy]);
      this.selectCells([copy.id]);
    }

    if (target.kind === 'edge') {
      const copy: PolicyEdge = {
        ...structuredClone(target.item),
        id: `edge-${generateUUID()}`,
      };
      this.edges.set([...this.edges(), copy]);
      this.selectCells([copy.id]);
    }

    this.pushHistorySnapshot();
    this.renderGraph();
    this.closeContextMenu();
  }

  deleteContextCell(): void {
    if (!this.ensureCanEdit('eliminar elementos')) {
      this.closeContextMenu();
      return;
    }

    const target = this.findContextTarget();
    if (!target) {
      return;
    }

    if (target.kind === 'lane') {
      this.removeLane(target.item.id);
    } else if (target.kind === 'node') {
      this.removeNode(target.item.id);
    } else {
      this.removeEdge(target.item.id);
    }
    this.closeContextMenu();
  }

  openCreateFormModal(activityId?: string): void {
    if (!this.ensureCanEdit('crear formularios')) {
      return;
    }

    const selected = this.selectedEntity();
    const defaultActivityId = activityId ?? (selected?.kind === 'node' && selected.item.type === 'activity' ? selected.item.id : '');
    this.editingFormId.set(null);
    this.formName = '';
    this.formDescription = '';
    this.formActivityId = defaultActivityId;
    this.formFields = [createEmptyPolicyFormField()];
    this.formError.set('');
    this.formModalOpen.set(true);
  }

  openEditFormModal(form: PolicyForm): void {
    this.editingFormId.set(form.id);
    this.formName = form.name;
    this.formDescription = form.description;
    this.formActivityId = form.activity_id ?? '';
    this.formFields = form.fields.map((field) => hydratePolicyFormField(field));
    this.formError.set('');
    this.formModalOpen.set(true);
  }

  closeFormModal(): void {
    this.formModalOpen.set(false);
    this.formError.set('');
    this.closeFieldTypePicker();
  }

  openShareModal(): void {
    const policy = this.policy();
    if (!policy) {
      return;
    }

    this.adminService.listPolicyCollaborators(policy.id).subscribe({
      next: (collaborators) => {
        this.collaborators.set(collaborators);
        this.shareModalOpen.set(true);
      },
      error: () => {
        this.collaborators.set(policy.collaborators ?? []);
        this.shareModalOpen.set(true);
      },
    });
  }

  closeShareModal(): void {
    this.shareModalOpen.set(false);
  }

  onCollaboratorsUpdated(collaborators: PolicyCollaborator[]): void {
    this.collaborators.set(collaborators);
    const current = this.policy();
    if (current) {
      this.policy.set({ ...current, collaborators });
    }
  }

  toggleCompanyShare(): void {
    const current = this.policy();
    if (!current) return;
    const isShared = current.company_shared;
    const action = isShared
      ? this.adminService.disableCompanyShare(current.id)
      : this.adminService.enableCompanyShare(current.id);
    action.subscribe({
      next: () => {
        this.policy.update(p => ({ ...p!, company_shared: !isShared }));
        this.infoMessage.set(isShared ? 'Acceso de empresa revocado' : 'Compartido con toda la empresa');
        setTimeout(() => this.infoMessage.set(''), 3000);
      },
      error: (err) => {
        this.error.set(err?.error?.detail ?? 'Error al cambiar acceso de empresa');
      },
    });
  }

  // HU-2.6: Validation and publication methods
  openValidationPanel(): void {
    this.showValidationPanel.set(true);
  }

  closeValidationPanel(): void {
    this.showValidationPanel.set(false);
  }

  onPolicyPublished(): void {
    // Refresh policy data after successful publication
    const policyId = this.policy()?.id;
    if (policyId) {
      this.adminService.getPolicy(policyId).subscribe({
        next: (policy) => {
          this.policy.set(policy);
          this.infoMessage.set('Política publicada exitosamente');
          this.closeValidationPanel();
          setTimeout(() => this.infoMessage.set(''), 3000);
        },
        error: (err) => {
          this.error.set('Error al actualizar política después de publicación');
          console.error(err);
        },
      });
     }
   }
 
   currentUserId(): string {
     return this.authService.getCurrentUser()?.id ?? '';
   }

  toggleFieldTypePicker(fieldId: string, event: MouseEvent): void {
    event.stopPropagation();

    if (this.openFieldTypePickerId() === fieldId) {
      this.closeFieldTypePicker();
      return;
    }

    const trigger = event.currentTarget as HTMLElement;
    const rect = trigger.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const preferredMaxHeight = 280;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const openUpward = spaceBelow < 160 && spaceAbove > spaceBelow;
    const availableSpace = openUpward ? spaceAbove - gap : spaceBelow - gap;
    const maxHeight = Math.max(120, Math.min(preferredMaxHeight, availableSpace));
    const top = openUpward ? rect.top - gap - maxHeight : rect.bottom + gap;

    this.fieldTypePickerMenuStyle.set({
      top: `${Math.max(viewportPadding, Math.min(top, window.innerHeight - maxHeight - viewportPadding))}px`,
      left: `${Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - rect.width - viewportPadding))}px`,
      width: `${rect.width}px`,
      maxHeight: `${maxHeight}px`,
    });
    this.openFieldTypePickerId.set(fieldId);
  }

  closeFieldTypePicker(): void {
    this.openFieldTypePickerId.set(null);
    this.fieldTypePickerMenuStyle.set(null);
  }

  selectFieldType(fieldId: string, type: PolicyFormFieldType): void {
    this.onFieldTypeChange(fieldId, type);
    this.closeFieldTypePicker();
  }

  isFieldTypePickerOpen(fieldId: string): boolean {
    return this.openFieldTypePickerId() === fieldId;
  }

  isSelectedFieldType(fieldId: string, type: PolicyFormFieldType): boolean {
    return this.formFields.find((field) => field.id === fieldId)?.type === type;
  }

  trackFormField(_index: number, field: PolicyFormField): string {
    return field.id;
  }

  trackOptionIndex(index: number): number {
    return index;
  }

  fieldOptionsPreview(field: PolicyFormField): string[] {
    return field.options.map((option) => option.trim()).filter(Boolean);
  }

  private findFormField(fieldId: string): PolicyFormField | undefined {
    return this.formFields.find((field) => field.id === fieldId);
  }

  addFormField(type: PolicyFormFieldType = 'text'): void {
    this.formFields.push(createEmptyPolicyFormField(type));
  }

  removeFormField(fieldId: string): void {
    const index = this.formFields.findIndex((field) => field.id === fieldId);
    if (index >= 0) {
      this.formFields.splice(index, 1);
    }
  }

  updateFormField(fieldId: string, patch: Partial<PolicyFormField>): void {
    const field = this.findFormField(fieldId);
    if (!field) {
      return;
    }
    Object.assign(field, patch);
  }

  onFieldLabelChange(fieldId: string, label: string): void {
    const field = this.findFormField(fieldId);
    if (!field) {
      return;
    }
    field.label = label;
    field.name = slugifyFieldName(label);
  }

  onFieldTypeChange(fieldId: string, type: PolicyFormFieldType): void {
    const field = this.findFormField(fieldId);
    if (!field) {
      return;
    }

    const next = createEmptyPolicyFormField(type);
    field.type = type;
    field.options = fieldTypeNeedsOptions(type) ? field.options : [];
    field.placeholder = type === 'file' ? null : field.placeholder;
    field.validation = next.validation;
    if (fieldTypeNeedsOptions(type) && !field.options.length) {
      field.options.push('');
    }
    if (!fieldTypeNeedsOptions(type)) {
      const { optionsText, ...rest } = field.metadata;
      field.metadata = rest;
    }
  }

  addFieldOption(fieldId: string): void {
    const field = this.findFormField(fieldId);
    if (field) {
      field.options.push('');
    }
  }

  updateFieldOption(fieldId: string, optionIndex: number, value: string): void {
    const field = this.findFormField(fieldId);
    if (field && field.options[optionIndex] !== undefined) {
      field.options[optionIndex] = value;
    }
  }

  removeFieldOption(fieldId: string, optionIndex: number): void {
    const field = this.findFormField(fieldId);
    if (field) {
      field.options.splice(optionIndex, 1);
    }
  }

  private syncAllFieldOptions(): void {
    for (const field of this.formFields) {
      if (fieldTypeNeedsOptions(field.type)) {
        field.options = field.options.map((option) => option.trim()).filter(Boolean);
      }
    }
  }

  savePolicyForm(): void {
    if (!this.formName.trim() || !this.formDescription.trim()) {
      this.formError.set('Nombre y descripción son obligatorios.');
      return;
    }
    if (!this.formActivityId) {
      this.formError.set('Debes asociar el formulario a una actividad.');
      return;
    }

    this.syncAllFieldOptions();

    const validationError = validatePolicyFormFields(this.formFields);
    if (validationError) {
      this.formError.set(validationError);
      return;
    }

    const body: PolicyFormCreate = {
      name: this.formName.trim(),
      description: this.formDescription.trim(),
      activity_id: this.formActivityId,
      fields: serializePolicyFormFields(this.formFields),
    };

    const request$ = this.editingFormId()
      ? this.adminService.updatePolicyForm(this.policyId, this.editingFormId()!, body)
      : this.adminService.createPolicyForm(this.policyId, body);

    request$.subscribe({
      next: (form) => {
        if (this.editingFormId()) {
          this.forms.set(this.forms().map((item) => (item.id === form.id ? form : item)));
        } else {
          this.forms.set([...this.forms(), form]);
        }
        const current = this.policy();
        if (current) {
          this.policy.set({
            ...current,
            diagram: { ...current.diagram, forms: this.forms() },
          });
        }
        this.closeFormModal();
        this.infoMessage.set('Formulario guardado correctamente.');
      },
      error: (error) => {
        this.formError.set(error?.error?.detail ?? 'No se pudo guardar el formulario.');
      },
    });
  }

  private setupCollaboration(): void {
    const user = this.authService.getCurrentUser();
    if (!user) {
      return;
    }

    this.collaboration.connectToPolicy(this.policyId, user.id, user.email, user.full_name);
    this.collaborationEventsSub?.unsubscribe();
    this.collaborationEventsSub = this.collaboration.onEvent().subscribe((event) => {
      if (event.type === 'policy.editor.access_revoked') {
        this.onAccessRevoked();
        return;
      }

      if (event.type === 'policy.editor.access_granted') {
        const targetUserId = event.payload['user_id'] as string | undefined;
        if (targetUserId && targetUserId !== user.id) {
          return;
        }

        this.onAccessGranted(event.payload['collaborator'] as PolicyCollaborator | undefined);
        return;
      }

      this.handleCollaborationEvent(event, user.id);
    });
    this.startCollaborationReconnectWatch();
  }

  private startCollaborationReconnectWatch(): void {
    if (this.collaborationReconnectTimer) {
      clearInterval(this.collaborationReconnectTimer);
    }

    this.collaborationReconnectTimer = setInterval(() => {
      const user = this.authService.getCurrentUser();
      const policy = this.policy();
      if (!user || !policy || policy.created_by === user.id || this.canEditPolicy()) {
        return;
      }

      if (!this.collaboration.isConnected()) {
        this.collaboration.connectToPolicy(this.policyId, user.id, user.email, user.full_name);
        return;
      }

      this.adminService.getPolicy(this.policyId).subscribe({
        next: (latest) => {
          const collaborator = latest.collaborators?.find(
            (item) => item.user_id === user.id && item.role === 'editor'
          );
          if (collaborator && (this.collaboration.accessRevoked() || !this.canEditPolicy())) {
            this.onAccessGranted(collaborator);
          }
        },
      });
    }, 5000);
  }

  private onAccessGranted(collaborator?: PolicyCollaborator): void {
    const wasReadOnly = this.collaboration.accessRevoked() || !this.canEditPolicy();

    if (collaborator) {
      const existing = this.collaborators();
      if (!existing.some((item) => item.user_id === collaborator.user_id)) {
        const nextCollaborators = [...existing, collaborator];
        this.collaborators.set(nextCollaborators);
        const current = this.policy();
        if (current) {
          this.policy.set({ ...current, collaborators: nextCollaborators });
        }
      }
    }

    this.collaboration.markAccessGranted();
    this.applyReadOnlyMode(true);

    if (wasReadOnly) {
      this.infoMessage.set('Ya puedes editar este diagrama.');
      this.error.set('');
    }
  }

  private onAccessRevoked(): void {
    this.collaboration.markAccessRevoked();
    const userId = this.authService.getCurrentUser()?.id;
    if (userId) {
      this.collaborators.set(this.collaborators().filter((collaborator) => collaborator.user_id !== userId));
    }

    this.connectionDragState = null;
    this.paletteDragState = null;
    this.dragState = null;
    this.edgeDraftSourceId.set(null);
    this.clearConnectionTargetHighlight();
    this.hideConnectionPreview();
    this.destroyConnectionOverlay();
    this.graph?.clearSelection();
    this.selectedCellIds.set([]);
    this.applyReadOnlyMode(false);
    this.infoMessage.set('El propietario revocó tu permiso de edición. Solo puedes ver el diagrama.');
    this.error.set('');
  }

  private ensureCanEdit(action = 'realizar esta acción'): boolean {
    if (this.canEditPolicy()) {
      return true;
    }

    this.infoMessage.set(`No tienes permiso para ${action}.`);
    return false;
  }

  private handleCollaborationEvent(event: EditorEvent, currentUserId: string): void {
    if (!event.type.startsWith('policy.diagram.')) {
      return;
    }

    const remoteUserId = event.payload['user_id'] as string | undefined;
    if (!remoteUserId || remoteUserId === currentUserId) {
      return;
    }

    const remoteVersion = Number(event.payload['version'] ?? 0);
    if (remoteVersion <= this.collaboration.diagramVersion()) {
      return;
    }

    const data = event.payload['data'] as {
      lanes?: PolicyLane[];
      nodes?: PolicyNode[];
      edges?: PolicyEdge[];
    } | undefined;

    if (!data?.lanes || !data?.nodes || !data?.edges) {
      return;
    }

    this.remoteSyncInProgress = true;
    this.lanes.set(structuredClone(data.lanes));
    this.nodes.set(structuredClone(data.nodes));
    this.edges.set(structuredClone(data.edges));
    this.collaboration.diagramVersion.set(remoteVersion);
    this.pushHistorySnapshot(true);
    this.renderGraph();
    window.setTimeout(() => {
      this.remoteSyncInProgress = false;
    }, 400);
    this.infoMessage.set('Un colaborador actualizó el diagrama en tiempo real.');
  }

  private scheduleCollaborationBroadcast(): void {
    if (this.remoteSyncInProgress || this.loading() || !this.canEditPolicy() || !this.collaboration.isConnected()) {
      return;
    }

    if (this.collaborationBroadcastTimeout) {
      clearTimeout(this.collaborationBroadcastTimeout);
    }

    this.collaborationBroadcastTimeout = setTimeout(() => {
      this.collaborationBroadcastTimeout = null;
      this.broadcastDiagramUpdate();
    }, 250);
  }

  private broadcastDiagramUpdate(): void {
    if (this.remoteSyncInProgress || !this.canEditPolicy() || !this.collaboration.isConnected()) {
      return;
    }

    this.collaboration.sendDiagramChange('updated', {
      lanes: this.lanes(),
      nodes: this.nodes(),
      edges: this.edges(),
    });
  }

  private loadData(): void {
    this.adminService.listDepartments().subscribe({ next: (departments) => this.departments.set(departments) });
    this.adminService.listPolicyForms(this.policyId).subscribe({ next: (forms) => this.forms.set(forms) });
    this.adminService.getPolicy(this.policyId).subscribe({
      next: (policy) => {
        this.policy.set(policy);
        this.lanes.set(policy.diagram.lanes);
        this.nodes.set(policy.diagram.nodes);
        this.edges.set(policy.diagram.edges);
        this.forms.set(policy.diagram.forms ?? []);
        this.collaborators.set(policy.collaborators ?? []);
        this.loading.set(false);
        this.infoMessage.set('Editor maxGraph listo para trabajar por etapas.');
        this.pushHistorySnapshot(true);
        this.scheduleGraphSetup();
        this.setupCollaboration();
      },
      error: (error) => {
        this.error.set(error?.error?.detail ?? 'No se pudo cargar el borrador');
        this.loading.set(false);
      },
    });
  }

  private scheduleGraphSetup(): void {
    if (this.loading()) {
      return;
    }

    afterNextRender(
      () => {
        void this.initializeGraph().then(() => this.tryRenderGraph());
      },
      { injector: this.injector }
    );
  }

  private async initializeGraph(): Promise<void> {
    if (this.graphInitialized) {
      return;
    }

    if (!this.graphContainer) {
      console.warn('Contenedor maxGraph aún no disponible; se reintentará en el siguiente ciclo de render.');
      return;
    }

    try {
      configureMaxGraphAssets();
      const container = this.graphContainer.nativeElement;
      registerUmlFinalShape();
      VertexHandlerConfig.rotationEnabled = true;
      InternalEvent.disableContextMenu(container);
      this.graph = new Graph(container);
      const baseIsCellResizable = this.graph.isCellResizable.bind(this.graph);
      this.graph.isCellResizable = (cell: any) => {
        const cellId = cell?.getId?.();
        if (cellId && this.laneCells.has(cellId)) {
          return false;
        }
        const node = cellId ? this.nodes().find((item) => item.id === cellId) : null;
        if (node?.type === 'fork' || node?.type === 'join' || node?.type === 'initial' || node?.type === 'final') {
          return false;
        }
        return baseIsCellResizable(cell);
      };
      const baseIsCellMovable = this.graph.isCellMovable.bind(this.graph);
      this.graph.isCellMovable = (cell: any) => {
        const cellId = cell?.getId?.();
        if (cellId && this.laneCells.has(cellId)) {
          return true;
        }
        return baseIsCellMovable(cell);
      };
      this.graph.setPanning(false);
      this.graph.setConnectable(false);
      this.graph.setAllowDanglingEdges(false);
      this.graph.setCellsResizable(true);
      this.graph.setCellsMovable(true);
      this.graph.setCellsEditable(true);
      this.graph.setAutoSizeCells(false);
      this.graph.allowAutoPanning = false;
      this.setupGraphConnectionHelpers();
      this.applyInteractionMode();
      this.graph.getSelectionModel().addListener(InternalEvent.CHANGE, () => this.updateSelectionFromGraph());
      this.graph.getDataModel().addListener(InternalEvent.CHANGE, () => this.scheduleSyncFromGraph());
      container.addEventListener('mousedown', (event) => this.handleCanvasMouseDown(event));
      container.addEventListener('click', (event) => this.handleCanvasClick(event));
      container.addEventListener('contextmenu', (event) => this.handleContextMenu(event));
      this.graphInitialized = true;
      this.graphReady.set(true);
      this.applyReadOnlyMode(this.canEditPolicy());
      this.infoMessage.set('Editor maxGraph cargado correctamente.');
    } catch (error) {
      console.error('No se pudo inicializar maxGraph', error);
      this.graphInitialized = false;
      this.graphReady.set(false);
      this.infoMessage.set(`No se pudo cargar el canvas interactivo. ${String(error)}.`);
    }
  }

  private tryRenderGraph(): void {
    if (!this.loading() && this.graphInitialized) {
      this.renderGraph();
    }
  }

  private renderGraph(): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }

    const viewport = this.captureGraphViewport();
    const parent = graph.getDefaultParent();
    this.renderInProgress = true;
    graph.batchUpdate(() => {
      const existing = graph.getChildCells(parent, true, true);
      if (existing.length) {
        graph.removeCells(existing);
      }

      this.laneCells.clear();
      this.nodeCells.clear();
      this.edgeCells.clear();

      this.lanes().forEach((lane, index) => {
        const laneHeight = this.laneContentSizes().get(lane.id)?.height ?? 128;
        const laneCell = graph.insertVertex({
          parent,
          value: lane.department_name,
          position: [24, this.laneY(index)],
          size: [this.diagramLaneWidth(), laneHeight],
          style: {
            shape: 'swimlane',
            horizontal: false,
            startSize: 28,
            rounded: true,
            fillColor: '#ffffff',
            swimlaneFillColor: '#f8fafc',
            strokeColor: '#1d4ed8',
            fontStyle: 1,
            fontColor: '#0f172a',
          },
        });
        laneCell.setId(lane.id);
        laneCell.setConnectable(true);
        this.laneCells.set(lane.id, laneCell);
      });

      this.nodes().forEach((node) => {
        const laneCell = node.lane_id ? this.laneCells.get(node.lane_id) : null;
        const nodeParent = laneCell ?? parent;
        const position = laneCell
          ? this.toRelativeLanePoint(laneCell, node.x, node.y)
          : { x: node.x, y: node.y };

        const nodeCell = graph.insertVertex({
          parent: nodeParent,
          value: node.label || this.nodeTypeLabel(node.type),
          position: [position.x, position.y],
          size: [node.width, node.height],
          style: this.nodeStyle(node.type, node),
        });
        nodeCell.setId(node.id);
        nodeCell.setConnectable(true);
        this.nodeCells.set(node.id, nodeCell);
      });

      this.edges().forEach((edge) => {
        const source = this.getConnectableCell(edge.source_id);
        const target = this.getConnectableCell(edge.target_id);
        if (!source || !target) {
          return;
        }

        const edgeCell = graph.insertEdge({
          parent,
          source,
          target,
          value: edge.label,
          style: this.edgeStyle(edge),
        });
        edgeCell.setId(edge.id);
        this.edgeCells.set(edge.id, edgeCell);
      });
    });
    this.renderInProgress = false;
    this.restoreGraphViewport(viewport);
    this.reapplySelection();
    graph.view.validate();
    this.updateConnectionOverlay();
  }

  private insertNodeIntoGraph(node: PolicyNode): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }

    const parent = graph.getDefaultParent();
    const laneCell = node.lane_id ? this.laneCells.get(node.lane_id) : null;
    const nodeParent = laneCell ?? parent;
    const position = laneCell
      ? this.toRelativeLanePoint(laneCell, node.x, node.y)
      : { x: node.x, y: node.y };

    let nodeCell: any;
    this.renderInProgress = true;
    graph.batchUpdate(() => {
      nodeCell = graph.insertVertex({
        parent: nodeParent,
        value: node.label || this.nodeTypeLabel(node.type),
        position: [position.x, position.y],
        size: [node.width, node.height],
        style: this.nodeStyle(node.type, node),
      });
      nodeCell.setId(node.id);
      nodeCell.setConnectable(true);
      this.nodeCells.set(node.id, nodeCell);
    });
    this.renderInProgress = false;

    if (nodeCell) {
      graph.setSelectionCell(nodeCell);
      this.selectedCellIds.set([node.id]);
      this.updateConnectionOverlay();
    }
  }

  private handleCanvasClick(event: MouseEvent): void {
    if (!this.graph || !this.graphReady()) {
      return;
    }

    if (this.suppressNextCanvasClick) {
      this.suppressNextCanvasClick = false;
      return;
    }

    const tool = this.activeTool();
    if (tool === 'select' || tool === 'pan') {
      return;
    }

    if (!this.ensureCanEdit('editar el diagrama')) {
      return;
    }

    const point = this.getGraphPointFromEvent(event);
    const cell = this.graph.getCellAt(point.x, point.y);

    if (tool === 'edge') {
      this.handleEdgeToolClick(cell, point);
      return;
    }

    if (tool === 'lane') {
      this.createLaneAtPoint(point.y);
      return;
    }

    const laneId = this.resolveLaneIdFromCell(cell) ?? this.resolveLaneIdFromPoint(point.y);
    this.createNodeAtPoint(tool, point.x, point.y, laneId);
  }

  private handleContextMenu(event: MouseEvent): void {
    if (!this.graph || !this.graphReady()) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const point = this.graph.getPointForEvent(event);
    const cell = this.graph.getCellAt(point.x, point.y);
    const cellId = cell?.getId?.() ?? null;
    if (!cellId) {
      this.closeContextMenu();
      return;
    }

    this.selectedCellIds.set([cellId]);
    this.contextMenu.set({ visible: true, x: event.clientX, y: event.clientY, cellId });
  }

  private createLaneAtPoint(clickY: number): void {
    const department = this.departments().find((item) => item.id === this.selectedDepartmentId);
    if (!department) {
      this.infoMessage.set('Selecciona un departamento antes de insertar una calle.');
      return;
    }

    const insertIndex = this.resolveLaneInsertIndex(clickY);
    const lane: PolicyLane = {
      id: `lane-${generateUUID()}`,
      department_id: department.id,
      department_name: department.name,
    };
    const nextLanes = [...this.lanes()];
    nextLanes.splice(insertIndex, 0, lane);
    this.lanes.set(nextLanes);
    this.selectedDepartmentId = '';
    this.pushHistorySnapshot();
    this.renderGraph();
    this.infoMessage.set(`Calle insertada para ${department.name}.`);
  }

  private createNodeAtPoint(type: DiagramElementType, clickX: number, clickY: number, laneIdHint: string | null = null): void {
    const laneId = this.requiresLane(type) ? laneIdHint ?? this.resolveLaneIdFromPoint(clickY) : null;
    if (this.requiresLane(type) && !laneId) {
      this.infoMessage.set('Haz clic dentro de una calle válida para insertar este elemento.');
      return;
    }
    if (type === 'initial' && this.nodes().some((node) => node.type === 'initial')) {
      this.infoMessage.set('Solo puede existir un nodo inicial.');
      return;
    }

    const width = this.nodeWidth(type);
    const height = this.nodeHeight(type);
    const x = clickX - width / 2;
    const y = clickY - height / 2;

    const node: PolicyNode = {
      id: `node-${generateUUID()}`,
      type,
      label: this.nodeLabel.trim(),
      lane_id: this.requiresLane(type) ? laneId : null,
      x,
      y,
      width,
      height,
      metadata: {},
    };

    this.nodes.set([...this.nodes(), node]);
    this.pushHistorySnapshot();
    this.insertNodeIntoGraph(node);
    this.setTool('select');
    this.infoMessage.set(`${this.nodeTypeLabel(type)} creado en el lienzo.`);
  }

  private handleEdgeToolClick(cell: any, point?: { x: number; y: number }): void {
    const cellId = this.resolveConnectableIdFromCell(cell) ?? (point ? this.resolveTargetConnectableAtPoint(point) : null);
    if (!cellId) {
      this.infoMessage.set('Con la herramienta flujo debes hacer clic sobre nodos válidos.');
      return;
    }

    const sourceId = this.edgeDraftSourceId();
    if (!sourceId) {
      this.edgeDraftSourceId.set(cellId);
      this.infoMessage.set('Nodo origen seleccionado. Ahora haz clic en el nodo destino.');
      return;
    }

    if (sourceId === cellId) {
      this.infoMessage.set('Selecciona un nodo destino diferente.');
      return;
    }

    this.createEdgeBetweenNodes(sourceId, cellId);
  }

  private createEdgeBetweenNodes(
    sourceId: string,
    targetId: string,
    anchors?: { sourceSide?: ConnectorSide; targetSide?: ConnectorSide }
  ): void {
    if (!this.ensureCanEdit('crear flujos')) {
      return;
    }

    const edge: PolicyEdge = {
      id: `edge-${generateUUID()}`,
      source_id: sourceId,
      target_id: targetId,
      label: this.edgeLabel.trim(),
      metadata: {
        ...(anchors?.sourceSide ? { sourceSide: anchors.sourceSide } : {}),
        ...(anchors?.targetSide ? { targetSide: anchors.targetSide } : {}),
      },
    };
    this.edges.set([...this.edges(), edge]);
    this.edgeDraftSourceId.set(null);
    this.edgeLabel = '';
    this.pushHistorySnapshot();
    this.insertEdgeIntoGraph(edge, anchors);
    this.infoMessage.set('Flujo creado entre nodos.');
  }

  private insertEdgeIntoGraph(edge: PolicyEdge, anchors?: { sourceSide?: ConnectorSide; targetSide?: ConnectorSide }): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }

    const source = this.getConnectableCell(edge.source_id);
    const target = this.getConnectableCell(edge.target_id);
    if (!source || !target) {
      return;
    }

    const parent = graph.getDefaultParent();
    const resolvedAnchors = anchors ?? this.resolveEdgeAnchors(edge);
    let edgeCell: any;
    this.renderInProgress = true;
    graph.batchUpdate(() => {
      edgeCell = graph.insertEdge({
        parent,
        source,
        target,
        value: edge.label,
        style: this.edgeStyle(edge, resolvedAnchors),
      });
      edgeCell.setId(edge.id);
      this.edgeCells.set(edge.id, edgeCell);
    });
    this.renderInProgress = false;
    graph.view.validate();
    graph.refresh();

    if (edgeCell) {
      graph.orderCells(true, [edgeCell]);
      graph.setSelectionCell(edgeCell);
      this.selectedCellIds.set([edge.id]);
    }
  }

  private setupGraphConnectionHelpers(): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }

    const connectionHandler = graph.getPlugin('ConnectionHandler') as ConnectionHandler | null;
    connectionHandler?.setEnabled(false);

    const view = graph.getView();
    const refreshOverlay = () => this.scheduleConnectionOverlayRefresh();

    view.addListener(InternalEvent.SCALE, refreshOverlay);
    view.addListener(InternalEvent.TRANSLATE, refreshOverlay);
    view.addListener(InternalEvent.SCALE_AND_TRANSLATE, refreshOverlay);
    view.addListener(InternalEvent.UP, refreshOverlay);
    view.addListener(InternalEvent.DOWN, refreshOverlay);

    graph.getDataModel().addListener(InternalEvent.CHANGE, () => {
      if (!this.renderInProgress && !this.connectionDragState) {
        this.scheduleConnectionOverlayRefresh();
      }
    });

    this.setupConnectionOverlayObserver();

    const container = this.graphContainer?.nativeElement;
    container?.addEventListener('scroll', () => this.scheduleConnectionOverlayRefresh(), { passive: true });
  }

  private setupConnectionOverlayObserver(): void {
    const container = this.graph?.container as HTMLElement | null;
    if (!container || this.connectionOverlayObserver) {
      return;
    }

    this.connectionOverlayObserver = new MutationObserver(() => {
      if (this.connectionOverlayRoot?.childElementCount || this.connectionPreviewSvg) {
        this.raiseConnectionOverlayToFront();
      }
    });
    this.connectionOverlayObserver.observe(container, { childList: true });
  }

  private finishConnectionDrag(event: MouseEvent): void {
    const drag = this.connectionDragState;
    this.connectionDragState = null;
    this.clearConnectionTargetHighlight();
    this.hideConnectionPreview();
    document.body.style.cursor = '';

    if (!drag || !this.graph) {
      this.updateConnectionOverlay();
      return;
    }

    const point = this.getGraphPointFromEvent(event);
    const targetId = this.resolveTargetConnectableAtClientPoint(event.clientX, event.clientY, drag.sourceId)
      ?? this.resolveTargetConnectableAtPoint(point, drag.sourceId);
    if (!targetId) {
      this.infoMessage.set('Suelta sobre otro nodo o calle para crear el flujo.');
      this.updateConnectionOverlay();
      return;
    }

    const targetCell = this.getConnectableCell(targetId);
    const targetSide = targetCell ? this.closestSideForCell(targetCell, event.clientX, event.clientY) : undefined;
    this.createEdgeBetweenNodes(drag.sourceId, targetId, {
      sourceSide: drag.sourceSide,
      targetSide,
    });
    this.suppressNextCanvasClick = true;
    event.preventDefault();
    this.updateConnectionOverlay();
  }

  private scheduleConnectionOverlayRefresh(): void {
    if (this.connectionOverlayRefreshScheduled) {
      return;
    }

    this.connectionOverlayRefreshScheduled = true;
    queueMicrotask(() => {
      this.connectionOverlayRefreshScheduled = false;
      this.updateConnectionOverlay();
      this.raiseConnectionOverlayToFront();
      requestAnimationFrame(() => this.raiseConnectionOverlayToFront());
    });
  }

  private updateConnectionOverlay(): void {
    if (this.connectionDragState) {
      return;
    }

    if (this.activeTool() !== 'select' || !this.graph || !this.graphReady()) {
      this.renderConnectionHandles([]);
      this.hideConnectionPreview();
      return;
    }

    const connectableId = this.getSingleSelectedConnectableId();
    if (!connectableId) {
      this.renderConnectionHandles([]);
      return;
    }

    const handles = PolicyEditorPageComponent.CONNECTOR_SIDES
      .map((side) => {
        const point = this.getConnectableSidePoint(connectableId, side);
        return point ? { side, ...point } : null;
      })
      .filter((handle): handle is { side: ConnectorSide; x: number; y: number } => !!handle);

    if (!handles.length) {
      this.renderConnectionHandles([]);
      return;
    }

    this.renderConnectionHandles(handles);
    this.raiseConnectionOverlayToFront();
  }

  private ensureConnectionOverlayRoot(): HTMLDivElement | null {
    const graph = this.graph;
    const container = graph?.container as HTMLElement | null;
    if (!container) {
      return null;
    }

    if (!this.connectionOverlayRoot) {
      this.connectionOverlayRoot = document.createElement('div');
      this.connectionOverlayRoot.className = 'mxgraph-connection-overlay-root';
      Object.assign(this.connectionOverlayRoot.style, {
        position: 'absolute',
        left: '0',
        top: '0',
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: '100000',
      });
    }

    // HTML swimlanes/nodes live as siblings inside graph.container; keep handles last.
    container.appendChild(this.connectionOverlayRoot);
    return this.connectionOverlayRoot;
  }

  private raiseConnectionOverlayToFront(): void {
    const container = this.graph?.container as HTMLElement | null;
    const root = this.connectionOverlayRoot;
    if (!container || !root || root.parentElement !== container) {
      return;
    }

    if (container.lastElementChild === root) {
      return;
    }

    container.appendChild(root);
  }

  private renderConnectionHandles(handles: Array<{ side: ConnectorSide; x: number; y: number }>): void {
    const root = this.ensureConnectionOverlayRoot();
    if (!root) {
      return;
    }

    root.replaceChildren();

    for (const handle of handles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'connection-handle';
      button.title = `Conectar ${this.connectionHandleArrow(handle.side)}`;
      button.textContent = this.connectionHandleArrow(handle.side);
      button.style.left = `${handle.x}px`;
      button.style.top = `${handle.y}px`;
      button.addEventListener('mousedown', (event) => {
        this.onConnectionHandlePointerDown(handle.side, event);
      });
      root.appendChild(button);
    }
  }

  private updateConnectionTargetHighlight(targetId: string | null): void {
    if (!targetId) {
      this.clearConnectionTargetHighlight();
      return;
    }

    const graph = this.graph;
    const cell = graph ? this.getConnectableCell(targetId) : null;
    const state = cell && graph ? graph.view.getState(cell) : null;
    if (!state) {
      this.clearConnectionTargetHighlight();
      return;
    }

    const root = this.ensureConnectionOverlayRoot();
    if (!root) {
      return;
    }

    if (this.connectionTargetHighlightId !== targetId) {
      this.connectionTargetHighlightEl?.remove();
      this.connectionTargetHighlightEl = document.createElement('div');
      this.connectionTargetHighlightEl.className = 'connection-target-highlight';
      root.insertBefore(this.connectionTargetHighlightEl, root.firstChild);
      this.connectionTargetHighlightId = targetId;
    }

    const padding = 5;
    const highlight = this.connectionTargetHighlightEl!;
    highlight.style.left = `${state.x - padding}px`;
    highlight.style.top = `${state.y - padding}px`;
    highlight.style.width = `${state.width + padding * 2}px`;
    highlight.style.height = `${state.height + padding * 2}px`;
    this.raiseConnectionOverlayToFront();
  }

  private clearConnectionTargetHighlight(): void {
    this.connectionTargetHighlightEl?.remove();
    this.connectionTargetHighlightEl = null;
    this.connectionTargetHighlightId = null;
  }

  private updateConnectionPreview(x1: number, y1: number, x2: number, y2: number, validTarget = false): void {
    const root = this.ensureConnectionOverlayRoot();
    if (!root) {
      return;
    }

    if (!this.connectionPreviewSvg) {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'connection-preview-layer');
      const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'policy-connection-preview-arrow');
      marker.setAttribute('markerUnits', 'userSpaceOnUse');
      marker.setAttribute('markerWidth', '6');
      marker.setAttribute('markerHeight', '6');
      marker.setAttribute('refX', '5');
      marker.setAttribute('refY', '3');
      marker.setAttribute('orient', 'auto');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L0,6 L6,3 z');
      path.setAttribute('fill', '#1d4ed8');
      marker.appendChild(path);
      defs.appendChild(marker);
      svg.appendChild(defs);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('stroke', '#1d4ed8');
      line.setAttribute('stroke-width', '2');
      line.setAttribute('stroke-dasharray', '5 4');
      line.setAttribute('marker-end', 'url(#policy-connection-preview-arrow)');
      svg.appendChild(line);

      this.connectionPreviewSvg = svg;
      this.connectionPreviewLineEl = line;
      root.appendChild(svg);
    }

    const stroke = validTarget ? '#0284c7' : '#1d4ed8';
    this.connectionPreviewLineEl?.setAttribute('stroke', stroke);
    this.connectionPreviewLineEl?.setAttribute('x1', String(x1));
    this.connectionPreviewLineEl?.setAttribute('y1', String(y1));
    this.connectionPreviewLineEl?.setAttribute('x2', String(x2));
    this.connectionPreviewLineEl?.setAttribute('y2', String(y2));
    this.raiseConnectionOverlayToFront();
  }

  private hideConnectionPreview(): void {
    this.connectionPreviewSvg?.remove();
    this.connectionPreviewSvg = null;
    this.connectionPreviewLineEl = null;
  }

  private destroyConnectionOverlay(): void {
    this.connectionOverlayObserver?.disconnect();
    this.connectionOverlayObserver = null;
    this.clearConnectionTargetHighlight();
    this.hideConnectionPreview();
    this.connectionOverlayRoot?.remove();
    this.connectionOverlayRoot = null;
  }

  private getStateSidePoint(state: any, side: ConnectorSide, offset = 8): { x: number; y: number } {
    if (side === 'top') {
      return { x: state.getCenterX(), y: state.y - offset };
    }
    if (side === 'right') {
      return { x: state.x + state.width + offset, y: state.getCenterY() };
    }
    if (side === 'bottom') {
      return { x: state.getCenterX(), y: state.y + state.height + offset };
    }
    return { x: state.x - offset, y: state.getCenterY() };
  }

  private getConnectableSidePoint(id: string, side: ConnectorSide, offset = 8): { x: number; y: number } | null {
    const cell = this.getConnectableCell(id);
    if (!cell || !this.graph) {
      return null;
    }

    if (this.laneCells.has(id)) {
      const geometry = cell.getGeometry?.();
      if (!geometry) {
        return null;
      }

      const view = this.graph.getView();
      const x = (geometry.x + view.translate.x) * view.scale;
      const y = (geometry.y + view.translate.y) * view.scale;
      const width = geometry.width * view.scale;
      const height = geometry.height * view.scale;

      if (side === 'top') {
        return { x: x + width / 2, y: y - offset };
      }
      if (side === 'right') {
        return { x: x + width + offset, y: y + height / 2 };
      }
      if (side === 'bottom') {
        return { x: x + width / 2, y: y + height + offset };
      }
      return { x: x - offset, y: y + height / 2 };
    }

    const state = this.graph.view.getState(cell);
    return state ? this.getStateSidePoint(state, side, offset) : null;
  }

  private getViewPointFromClient(clientX: number, clientY: number): { x: number; y: number } {
    const graph = this.graph;
    if (!graph) {
      return { x: clientX, y: clientY };
    }

    const modelPoint = graph.getPointForEvent({ clientX, clientY, button: 0 } as MouseEvent, false);
    const view = graph.view;
    return {
      x: (modelPoint.x + view.translate.x) * view.scale,
      y: (modelPoint.y + view.translate.y) * view.scale,
    };
  }

  private getSingleSelectedConnectableId(): string | null {
    const graph = this.graph;
    if (!graph) {
      return null;
    }

    const selectedConnectables = graph
      .getSelectionCells()
      .filter((cell: any) => {
        const id = cell?.getId?.();
        return !!id && (this.nodeCells.has(id) || this.laneCells.has(id));
      });

    return selectedConnectables.length === 1 ? selectedConnectables[0].getId() : null;
  }

  private getConnectableCell(id: string | null | undefined): any | null {
    if (!id) {
      return null;
    }

    return this.nodeCells.get(id) ?? this.laneCells.get(id) ?? null;
  }

  private getCellClientBounds(cell: any): DOMRect | null {
    const graph = this.graph;
    if (!graph || !cell) {
      return null;
    }

    const state = graph.view.getState(cell);
    if (!state) {
      return null;
    }

    const elements: Element[] = [];
    const shapeNode = state.shape?.node;
    const textNode = state.text?.node;
    if (shapeNode instanceof Element) {
      elements.push(shapeNode);
    }
    if (textNode instanceof Element && textNode !== shapeNode) {
      elements.push(textNode);
    }

    if (elements.length > 0) {
      let left = Number.POSITIVE_INFINITY;
      let top = Number.POSITIVE_INFINITY;
      let right = Number.NEGATIVE_INFINITY;
      let bottom = Number.NEGATIVE_INFINITY;

      for (const element of elements) {
        const rect = element.getBoundingClientRect();
        left = Math.min(left, rect.left);
        top = Math.min(top, rect.top);
        right = Math.max(right, rect.right);
        bottom = Math.max(bottom, rect.bottom);
      }

      return new DOMRect(left, top, Math.max(right - left, 1), Math.max(bottom - top, 1));
    }

    return this.getStateClientBounds(state);
  }

  private getStateClientBounds(state: any): DOMRect {
    const topLeft = this.getClientPointFromViewPoint(state.x, state.y);
    const bottomRight = this.getClientPointFromViewPoint(state.x + state.width, state.y + state.height);

    return new DOMRect(
      topLeft.x,
      topLeft.y,
      Math.max(bottomRight.x - topLeft.x, 1),
      Math.max(bottomRight.y - topLeft.y, 1)
    );
  }

  private getClientPointFromViewPoint(viewX: number, viewY: number): { x: number; y: number } {
    const container = this.graph?.container ?? this.graphContainer?.nativeElement;
    if (!container) {
      return { x: viewX, y: viewY };
    }

    const rect = container.getBoundingClientRect();
    return {
      x: rect.left + viewX - container.scrollLeft,
      y: rect.top + viewY - container.scrollTop,
    };
  }

  private getClientSidePoint(rect: DOMRect, side: ConnectorSide, offset = 8): { x: number; y: number } {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    if (side === 'top') {
      return { x: centerX, y: rect.top - offset };
    }
    if (side === 'right') {
      return { x: rect.right + offset, y: centerY };
    }
    if (side === 'bottom') {
      return { x: centerX, y: rect.bottom + offset };
    }
    return { x: rect.left - offset, y: centerY };
  }

  private getConnectionHandleClientPoint(cell: any, side: ConnectorSide): { x: number; y: number } | null {
    const bounds = this.getCellClientBounds(cell);
    if (!bounds) {
      return null;
    }

    return this.getClientSidePoint(bounds, side);
  }

  private resolveTargetNodeAtClientPoint(clientX: number, clientY: number, excludeId?: string): string | null {
    const tolerance = 12;
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [nodeId, cell] of this.nodeCells) {
      if (nodeId === excludeId) {
        continue;
      }

      const bounds = this.getCellClientBounds(cell);
      if (!bounds) {
        continue;
      }

      if (
        clientX >= bounds.left - tolerance &&
        clientX <= bounds.right + tolerance &&
        clientY >= bounds.top - tolerance &&
        clientY <= bounds.bottom + tolerance
      ) {
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const distance = (centerX - clientX) ** 2 + (centerY - clientY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = nodeId;
        }
      }
    }

    return bestId;
  }

  private resolveTargetConnectableAtClientPoint(clientX: number, clientY: number, excludeId?: string): string | null {
    return (
      this.resolveTargetNodeAtClientPoint(clientX, clientY, excludeId) ??
      this.resolveTargetLaneAtClientPoint(clientX, clientY, excludeId)
    );
  }

  private resolveTargetLaneAtClientPoint(clientX: number, clientY: number, excludeId?: string): string | null {
    const tolerance = 12;
    let bestId: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const [laneId, cell] of this.laneCells) {
      if (laneId === excludeId) {
        continue;
      }

      const bounds = this.getCellClientBounds(cell);
      if (!bounds) {
        continue;
      }

      if (
        clientX >= bounds.left - tolerance &&
        clientX <= bounds.right + tolerance &&
        clientY >= bounds.top - tolerance &&
        clientY <= bounds.bottom + tolerance
      ) {
        const centerX = bounds.left + bounds.width / 2;
        const centerY = bounds.top + bounds.height / 2;
        const distance = (centerX - clientX) ** 2 + (centerY - clientY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestId = laneId;
        }
      }
    }

    return bestId;
  }

  private closestSideForCell(cell: any, clientX: number, clientY: number): ConnectorSide {
    const bounds = this.getCellClientBounds(cell);
    if (!bounds) {
      return 'right';
    }

    const candidates = PolicyEditorPageComponent.CONNECTOR_SIDES.map((side) => ({
      side,
      ...this.getClientSidePoint(bounds, side, 0),
    }));

    let closest = candidates[0];
    let closestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of candidates) {
      const distance = (candidate.x - clientX) ** 2 + (candidate.y - clientY) ** 2;
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = candidate;
      }
    }

    return closest.side;
  }

  private resolveTargetNodeAtPoint(modelPoint: { x: number; y: number }, excludeId?: string): string | null {
    const graph = this.graph;
    if (!graph) {
      return null;
    }

    const directHit = this.resolveNodeIdFromCell(graph.getCellAt(modelPoint.x, modelPoint.y));
    if (directHit && directHit !== excludeId) {
      return directHit;
    }

    const view = graph.view;
    const viewX = (modelPoint.x + view.translate.x) * view.scale;
    const viewY = (modelPoint.y + view.translate.y) * view.scale;
    const tolerance = 10;

    for (const [nodeId, cell] of this.nodeCells) {
      if (nodeId === excludeId) {
        continue;
      }

      const state = view.getState(cell);
      if (!state) {
        continue;
      }

      if (
        viewX >= state.x - tolerance &&
        viewX <= state.x + state.width + tolerance &&
        viewY >= state.y - tolerance &&
        viewY <= state.y + state.height + tolerance
      ) {
        return nodeId;
      }
    }

    return null;
  }

  private resolveTargetConnectableAtPoint(modelPoint: { x: number; y: number }, excludeId?: string): string | null {
    return (
      this.resolveTargetNodeAtPoint(modelPoint, excludeId) ??
      this.resolveTargetLaneAtPoint(modelPoint, excludeId)
    );
  }

  private resolveTargetLaneAtPoint(modelPoint: { x: number; y: number }, excludeId?: string): string | null {
    const graph = this.graph;
    if (!graph) {
      return null;
    }

    const directHit = this.resolveLaneIdFromCell(graph.getCellAt(modelPoint.x, modelPoint.y));
    if (directHit && directHit !== excludeId) {
      return directHit;
    }

    const view = graph.view;
    const viewX = (modelPoint.x + view.translate.x) * view.scale;
    const viewY = (modelPoint.y + view.translate.y) * view.scale;
    const tolerance = 10;

    for (const [laneId, cell] of this.laneCells) {
      if (laneId === excludeId) {
        continue;
      }

      const state = view.getState(cell);
      if (!state) {
        continue;
      }

      if (
        viewX >= state.x - tolerance &&
        viewX <= state.x + state.width + tolerance &&
        viewY >= state.y - tolerance &&
        viewY <= state.y + state.height + tolerance
      ) {
        return laneId;
      }
    }

    return null;
  }

  private sideConstraintValues(side: ConnectorSide): { x: number; y: number } {
    if (side === 'top') return { x: 0.5, y: 0 };
    if (side === 'right') return { x: 1, y: 0.5 };
    if (side === 'bottom') return { x: 0.5, y: 1 };
    return { x: 0, y: 0.5 };
  }

  private resolveEdgeAnchors(edge: PolicyEdge): { sourceSide?: ConnectorSide; targetSide?: ConnectorSide } {
    return {
      sourceSide: edge.metadata['sourceSide'] as ConnectorSide | undefined,
      targetSide: edge.metadata['targetSide'] as ConnectorSide | undefined,
    };
  }

  private edgeStyle(
    edge: PolicyEdge,
    anchors?: { sourceSide?: ConnectorSide; targetSide?: ConnectorSide }
  ): Record<string, unknown> {
    const sourceSide = anchors?.sourceSide ?? (edge.metadata['sourceSide'] as ConnectorSide | undefined);
    const targetSide = anchors?.targetSide ?? (edge.metadata['targetSide'] as ConnectorSide | undefined);
    const style: Record<string, unknown> = {
      edgeStyle: 'orthogonalEdgeStyle',
      rounded: true,
      orthogonalLoop: true,
      jettySize: 'auto',
      strokeColor: '#1d4ed8',
      strokeWidth: 2,
      endArrow: 'block',
      endFill: true,
      fontColor: '#0f172a',
    };

    if (sourceSide) {
      const sourceConstraint = this.sideConstraintValues(sourceSide);
      style['exitX'] = sourceConstraint.x;
      style['exitY'] = sourceConstraint.y;
    }

    if (targetSide) {
      const targetConstraint = this.sideConstraintValues(targetSide);
      style['entryX'] = targetConstraint.x;
      style['entryY'] = targetConstraint.y;
    }

    return style;
  }

  private resolveLaneInsertIndex(clickY: number): number {
    const sizes = this.laneContentSizes();
    for (let index = 0; index < this.lanes().length; index += 1) {
      const threshold = this.laneY(index) + (sizes.get(this.lanes()[index].id)?.height ?? 128) / 2;
      if (clickY < threshold) {
        return index;
      }
    }
    return this.lanes().length;
  }

  private resolveLaneIdFromPoint(clickY: number): string | null {
    const sizes = this.laneContentSizes();
    for (let index = 0; index < this.lanes().length; index += 1) {
      const top = this.laneY(index);
      const h = sizes.get(this.lanes()[index].id)?.height ?? 128;
      if (clickY >= top && clickY <= top + h) {
        return this.lanes()[index].id;
      }
    }
    return null;
  }

  private syncGraphBackToState(): boolean {
    let needsRender = this.syncLanesFromGraph();

    this.nodes.set(
      this.nodes().map((node) => {
        const cell = this.nodeCells.get(node.id);
        const geometry = cell?.getGeometry();
        const parentId = cell?.getParent?.()?.getId?.() ?? null;
        const parentLaneCell = parentId && this.laneCells.has(parentId) ? this.laneCells.get(parentId) : null;
        const modelLaneCell = node.lane_id ? this.laneCells.get(node.lane_id) : null;
        const laneCell = parentLaneCell ?? modelLaneCell;
        const absolutePoint =
          laneCell && geometry
            ? this.toAbsoluteLanePoint(laneCell, geometry.x, geometry.y)
            : { x: geometry?.x ?? node.x, y: geometry?.y ?? node.y };
        const laneId =
          parentId && this.laneCells.has(parentId)
            ? parentId
            : this.requiresLane(node.type)
              ? this.resolveLaneIdFromGeometry(absolutePoint.x, absolutePoint.y, node.type, node.lane_id)
              : null;
        const rotation = Number(this.graph?.getCellStyle(cell)?.rotation ?? node.metadata['rotation'] ?? 0);
        const nextWidth = geometry?.width ?? node.width;
        const nextHeight = geometry?.height ?? node.height;

        if (laneId !== node.lane_id) {
          needsRender = true;
        }

        return {
          ...node,
          label: String(cell?.getValue() ?? node.label ?? ''),
          x: absolutePoint.x,
          y: absolutePoint.y,
          width: nextWidth,
          height: nextHeight,
          lane_id: laneId,
          metadata: {
            ...node.metadata,
            rotation,
          },
        };
      })
    );

    this.edges.set(
      this.edges().map((edge) => ({
        ...edge,
        label: String(this.edgeCells.get(edge.id)?.getValue() ?? edge.label ?? ''),
      }))
    );

    return needsRender;
  }

  private updateSelectionFromGraph(): void {
    if (!this.graph) {
      return;
    }
    this.selectCells(
      this.graph
        .getSelectionCells()
        .map((cell: any) => cell.getId())
        .filter((id: string | null): id is string => !!id)
    );
    this.updateConnectionOverlay();
  }

  private scheduleSyncFromGraph(): void {
    if (this.renderInProgress || this.remoteSyncInProgress || !this.canEditPolicy()) {
      return;
    }

    if (this.syncTimeout) {
      clearTimeout(this.syncTimeout);
    }

    this.syncTimeout = setTimeout(() => {
      const needsRender = this.syncGraphBackToState();
      this.pushHistorySnapshot();
      if (needsRender) {
        this.renderGraph();
      }
      this.updateConnectionOverlay();
    }, 180);
  }

  private pushHistorySnapshot(force = false): void {
    const snapshot = this.createSnapshot();
    const serialized = JSON.stringify(snapshot);
    const currentSerialized = this.history[this.historyIndex] ? JSON.stringify(this.history[this.historyIndex]) : null;

    if (!force && serialized === currentSerialized) {
      this.updateHistoryFlags();
      return;
    }

    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(snapshot);
    this.historyIndex = this.history.length - 1;
    this.updateHistoryFlags();

    if (!force && !this.remoteSyncInProgress && !this.loading()) {
      this.scheduleCollaborationBroadcast();
    }
  }

  private restoreHistorySnapshot(): void {
    const snapshot = this.history[this.historyIndex];
    if (!snapshot) {
      return;
    }

    this.lanes.set(structuredClone(snapshot.lanes));
    this.nodes.set(structuredClone(snapshot.nodes));
    this.edges.set(structuredClone(snapshot.edges));
    this.selectedCellIds.set([]);
    this.updateHistoryFlags();
    this.renderGraph();
  }

  private createSnapshot(): { lanes: PolicyLane[]; nodes: PolicyNode[]; edges: PolicyEdge[] } {
    return {
      lanes: structuredClone(this.lanes()),
      nodes: structuredClone(this.nodes()),
      edges: structuredClone(this.edges()),
    };
  }

  private updateHistoryFlags(): void {
    this.canUndo.set(this.historyIndex > 0);
    this.canRedo.set(this.historyIndex >= 0 && this.historyIndex < this.history.length - 1);
  }

  private closeContextMenu(): void {
    this.contextMenu.set({ visible: false, x: 0, y: 0, cellId: null });
  }

  private findContextTarget():
    | { kind: 'lane'; item: PolicyLane }
    | { kind: 'node'; item: PolicyNode }
    | { kind: 'edge'; item: PolicyEdge }
    | null {
    const cellId = this.contextMenu().cellId;
    if (!cellId) {
      return null;
    }

    const lane = this.lanes().find((item) => item.id === cellId);
    if (lane) return { kind: 'lane', item: lane };

    const node = this.nodes().find((item) => item.id === cellId);
    if (node) return { kind: 'node', item: node };

    const edge = this.edges().find((item) => item.id === cellId);
    if (edge) return { kind: 'edge', item: edge };

    return null;
  }

  private reapplySelection(): void {
    if (!this.graph || !this.selectedCellIds().length) {
      return;
    }

    const selectedCells = this.selectedCellIds()
      .map((id) => this.nodeCells.get(id) ?? this.edgeCells.get(id) ?? this.laneCells.get(id))
      .filter((cell): cell is any => !!cell);
    if (selectedCells.length) {
      this.graph.setSelectionCells(selectedCells);
    }
  }

  updateSelectedLabel(value: string): void {
    const selected = this.selectedEntity();
    if (!selected) {
      return;
    }

    if (selected.kind === 'lane') {
      this.lanes.set(this.lanes().map((lane) => lane.id === selected.item.id ? { ...lane, department_name: value || lane.department_name } : lane));
      this.laneCells.get(selected.item.id)?.setValue(value || selected.item.department_name);
    }
    if (selected.kind === 'node') {
      this.nodes.set(this.nodes().map((node) => node.id === selected.item.id ? { ...node, label: value } : node));
      this.nodeCells.get(selected.item.id)?.setValue(value || this.nodeTypeLabel(selected.item.type));
    }
    if (selected.kind === 'edge') {
      this.edges.set(this.edges().map((edge) => edge.id === selected.item.id ? { ...edge, label: value } : edge));
      this.edgeCells.get(selected.item.id)?.setValue(value);
    }

    this.graph?.refresh();
    this.scheduleSyncFromGraph();
    this.scheduleConnectionOverlayRefresh();
  }

  updateSelectedNodeLane(laneId: string): void {
    const selected = this.selectedEntity();
    if (!selected || selected.kind !== 'node') {
      return;
    }

    this.nodes.set(this.nodes().map((node) => node.id === selected.item.id ? { ...node, lane_id: laneId || null } : node));
    this.renderGraph();
  }

  commitSelectedEdits(): void {
    if (!this.ensureCanEdit('aplicar cambios')) {
      return;
    }

    if (!this.selectedEntity()) {
      return;
    }
    this.pushHistorySnapshot();
    this.infoMessage.set('Cambios del elemento aplicados.');
  }

  private selectCells(ids: string[]): void {
    this.selectedCellIds.set(ids);
  }

  private buildDiagramSvgForExport(): { content: string; width: number; height: number } | null {
    const lanes = this.lanes();
    const nodes = this.nodes();
    const edges = this.edges();
    if (!lanes.length && !nodes.length) {
      return null;
    }

    const padding = 16;
    const laneWidth = this.diagramLaneWidth();
    const laneSizes = this.laneContentSizes();
    const laneBottom = lanes.reduce((bottom, lane, index) => {
      const height = laneSizes.get(lane.id)?.height ?? 128;
      return Math.max(bottom, this.laneY(index) + height);
    }, 0);
    const nodeRight = nodes.reduce((right, node) => Math.max(right, node.x + node.width), 0);
    const nodeBottom = nodes.reduce((bottom, node) => Math.max(bottom, node.y + node.height), 0);
    const width = Math.ceil(Math.max(laneWidth + 48, nodeRight + 120) + padding * 2);
    const height = Math.ceil(Math.max(laneBottom, nodeBottom, 320) + padding * 2);
    const policyName = this.escapeXml(this.policy()?.name || 'Diagrama de política');

    const laneSvg = lanes.map((lane, index) => {
      const y = this.laneY(index) + padding;
      const h = laneSizes.get(lane.id)?.height ?? 128;
      const labelX = padding + 15;
      const labelY = y + h / 2;
      return `
        <g>
          <rect x="${padding}" y="${y}" width="${laneWidth}" height="${h}" rx="8" fill="#f8fafc" stroke="#2563eb" stroke-width="1.5" />
          <line x1="${padding + 30}" y1="${y}" x2="${padding + 30}" y2="${y + h}" stroke="#2563eb" stroke-width="1" />
          <text x="${labelX}" y="${labelY}" transform="rotate(-90 ${labelX} ${labelY})" text-anchor="middle" dominant-baseline="middle" fill="#111827" font-size="11" font-weight="700">${this.escapeXml(lane.department_name)}</text>
        </g>`;
    }).join('');

    const nodeSvg = nodes.map((node) => this.exportNodeSvg(node, padding)).join('');
    const edgeSvg = edges.map((edge) => this.exportEdgeSvg(edge, nodes, padding)).join('');

    const content = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L0,6 L9,3 z" fill="#1d4ed8" />
    </marker>
  </defs>
  <rect x="0" y="0" width="${width}" height="${height}" fill="#ffffff" />
  ${laneSvg}
  ${edgeSvg}
  ${nodeSvg}
</svg>`;
    return { content, width, height };
  }

  private exportEdgeSvg(edge: PolicyEdge, nodes: PolicyNode[], padding: number): string {
    const source = this.exportConnectableBox(edge.source_id, nodes);
    const target = this.exportConnectableBox(edge.target_id, nodes);
    if (!source || !target) {
      return '';
    }

    const route = this.exportEdgeRoute(edge, source, target, padding);
    const points = route.points.map((point) => `${point.x},${point.y}`).join(' ');
    const label = this.escapeXml(edge.label || '');
    const labelWidth = Math.max(48, label.length * 7.6);
    const labelSvg = label ? `<g><rect x="${route.label.x - labelWidth / 2}" y="${route.label.y - 14}" width="${labelWidth}" height="18" rx="3" fill="#ffffff" opacity="0.9" /><text x="${route.label.x}" y="${route.label.y}" text-anchor="middle" fill="#1d4ed8" font-size="12" font-weight="700">${label}</text></g>` : '';
    return `
      <g>
        <polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" marker-end="url(#arrow)" />
        ${labelSvg}
      </g>`;
  }

  private exportConnectableBox(id: string, nodes: PolicyNode[]): PolicyNode | null {
    const node = nodes.find((item) => item.id === id);
    if (node) {
      return node;
    }

    const laneIndex = this.lanes().findIndex((lane) => lane.id === id);
    if (laneIndex < 0) {
      return null;
    }

    const lane = this.lanes()[laneIndex];
    return {
      id: lane.id,
      type: 'activity',
      label: lane.department_name,
      lane_id: null,
      x: 24,
      y: this.laneY(laneIndex),
      width: this.diagramLaneWidth(),
      height: this.laneContentSizes().get(lane.id)?.height ?? 128,
      metadata: {},
    };
  }

  private exportEdgeRoute(
    edge: PolicyEdge,
    source: PolicyNode,
    target: PolicyNode,
    padding: number
  ): { points: Array<{ x: number; y: number }>; label: { x: number; y: number } } {
    const sourceSide = (edge.metadata['sourceSide'] as ConnectorSide | undefined) ?? this.defaultSourceSide(source, target);
    const targetSide = (edge.metadata['targetSide'] as ConnectorSide | undefined) ?? this.defaultTargetSide(source, target);
    const start = this.exportNodeSidePoint(source, sourceSide, padding);
    const end = this.exportNodeSidePoint(target, targetSide, padding);
    const points = [start];

    if ((sourceSide === 'left' || sourceSide === 'right') && (targetSide === 'left' || targetSide === 'right')) {
      const midX = (start.x + end.x) / 2;
      points.push({ x: midX, y: start.y }, { x: midX, y: end.y });
    } else if ((sourceSide === 'top' || sourceSide === 'bottom') && (targetSide === 'top' || targetSide === 'bottom')) {
      const midY = (start.y + end.y) / 2;
      points.push({ x: start.x, y: midY }, { x: end.x, y: midY });
    } else if (sourceSide === 'left' || sourceSide === 'right') {
      points.push({ x: end.x, y: start.y });
    } else {
      points.push({ x: start.x, y: end.y });
    }

    points.push(end);
    const middle = points[Math.max(1, Math.floor(points.length / 2))];
    return {
      points,
      label: { x: middle.x, y: middle.y - 8 },
    };
  }

  private exportNodeSidePoint(node: PolicyNode, side: ConnectorSide, padding: number): { x: number; y: number } {
    const x = node.x + padding;
    const y = node.y + padding;
    if (side === 'top') return { x: x + node.width / 2, y };
    if (side === 'right') return { x: x + node.width, y: y + node.height / 2 };
    if (side === 'bottom') return { x: x + node.width / 2, y: y + node.height };
    return { x, y: y + node.height / 2 };
  }

  private defaultSourceSide(source: PolicyNode, target: PolicyNode): ConnectorSide {
    const dx = (target.x + target.width / 2) - (source.x + source.width / 2);
    const dy = (target.y + target.height / 2) - (source.y + source.height / 2);
    return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : (dy >= 0 ? 'bottom' : 'top');
  }

  private defaultTargetSide(source: PolicyNode, target: PolicyNode): ConnectorSide {
    const sourceSide = this.defaultSourceSide(source, target);
    if (sourceSide === 'right') return 'left';
    if (sourceSide === 'left') return 'right';
    if (sourceSide === 'bottom') return 'top';
    return 'bottom';
  }

  private exportNodeSvg(node: PolicyNode, padding: number): string {
    const x = node.x + padding;
    const y = node.y + padding;
    const cx = x + node.width / 2;
    const cy = y + node.height / 2;
    const label = this.escapeXml(node.label || this.nodeTypeLabel(node.type));
    const labelText = this.exportTextLines(label, cx, cy + 4, Math.max(10, Math.floor(node.width / 8)), node.type === 'activity' ? '#0f172a' : '#111827');

    if (node.type === 'initial') {
      return `<circle cx="${cx}" cy="${cy}" r="${Math.min(node.width, node.height) / 2}" fill="#0f172a" />`;
    }
    if (node.type === 'final') {
      const r = Math.min(node.width, node.height) / 2;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#ffffff" stroke="#0f172a" stroke-width="2" /><circle cx="${cx}" cy="${cy}" r="${Math.max(r - 7, 4)}" fill="#0f172a" />`;
    }
    if (node.type === 'decision') {
      const points = `${cx},${y} ${x + node.width},${cy} ${cx},${y + node.height} ${x},${cy}`;
      return `<g><polygon points="${points}" fill="#ffffff" stroke="#7c3aed" stroke-width="2" />${labelText}</g>`;
    }
    if (node.type === 'fork' || node.type === 'join') {
      return `<rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="3" fill="#111827" />`;
    }
    return `<g><rect x="${x}" y="${y}" width="${node.width}" height="${node.height}" rx="8" fill="#ffffff" stroke="#2563eb" stroke-width="2" />${labelText}</g>`;
  }

  private exportTextLines(text: string, x: number, y: number, maxChars: number, color: string): string {
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxChars && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) {
      lines.push(current);
    }
    const visible = lines.slice(0, 3);
    const startY = y - ((visible.length - 1) * 7);
    return `<text x="${x}" y="${startY}" text-anchor="middle" dominant-baseline="middle" fill="${color}" font-size="12" font-weight="700">${visible.map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : 14}">${line}</tspan>`).join('')}</text>`;
  }

  private buildDiagramExportModel(): Record<string, unknown> {
    const current = this.policy();
    return {
      policy: current
        ? {
            id: current.id,
            name: current.name,
            description: current.description,
            category: current.category,
            status: current.status,
          }
        : null,
      notation: 'UML',
      uml_version: '2.5',
      diagram: {
        lanes: this.lanes(),
        nodes: this.nodes(),
        edges: this.edges(),
        forms: this.forms(),
      },
    };
  }

  private buildDrawioXmlForExport(): string {
    const lanes = this.lanes();
    const nodes = this.nodes();
    const edges = this.edges();
    const laneWidth = this.diagramLaneWidth();
    const laneSizes = this.laneContentSizes();
    const cells: string[] = [
      '<mxCell id="0"/>',
      '<mxCell id="1" parent="0"/>',
    ];

    for (const [index, lane] of lanes.entries()) {
      const y = this.laneY(index);
      const h = laneSizes.get(lane.id)?.height ?? 128;
      cells.push(
        `<mxCell id="${this.escapeXml(lane.id)}" value="${this.escapeXml(lane.department_name)}" style="swimlane;html=1;horizontal=0;startSize=30;rounded=1;arcSize=8;whiteSpace=wrap;strokeColor=#2563eb;fillColor=#f8fafc;swimlaneFillColor=#ffffff;fontStyle=1;fontColor=#111827;" vertex="1" parent="1"><mxGeometry x="24" y="${y}" width="${laneWidth}" height="${h}" as="geometry"/></mxCell>`
      );
    }

    for (const node of nodes) {
      cells.push(
        `<mxCell id="${this.escapeXml(node.id)}" value="${this.escapeXml(node.label || this.nodeTypeLabel(node.type))}" style="${this.drawioNodeStyle(node.type)}" vertex="1" parent="1"><mxGeometry x="${node.x}" y="${node.y}" width="${node.width}" height="${node.height}" as="geometry"/></mxCell>`
      );
    }

    for (const edge of edges) {
      const sourceSide = edge.metadata['sourceSide'] as ConnectorSide | undefined;
      const targetSide = edge.metadata['targetSide'] as ConnectorSide | undefined;
      cells.push(
        `<mxCell id="${this.escapeXml(edge.id)}" value="${this.escapeXml(edge.label || '')}" style="${this.drawioEdgeStyle(sourceSide, targetSide)}" edge="1" parent="1" source="${this.escapeXml(edge.source_id)}" target="${this.escapeXml(edge.target_id)}"><mxGeometry relative="1" as="geometry"/></mxCell>`
      );
    }

    const name = this.escapeXml(this.policy()?.name || 'Diagrama UML 2.5');
    return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" type="device">
  <diagram name="${name}">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="1169" pageHeight="827" math="0" shadow="0">
      <root>
        ${cells.join('\n        ')}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;
  }

  private drawioNodeStyle(type: PolicyNodeType): string {
    if (type === 'initial') {
      return 'ellipse;html=1;aspect=fixed;shape=ellipse;fillColor=#0f172a;strokeColor=#0f172a;';
    }
    if (type === 'final') {
      return 'ellipse;html=1;aspect=fixed;shape=doubleEllipse;fillColor=#ffffff;strokeColor=#0f172a;strokeWidth=2;';
    }
    if (type === 'decision') {
      return 'rhombus;html=1;whiteSpace=wrap;fillColor=#ffffff;strokeColor=#7c3aed;fontColor=#111827;fontStyle=1;';
    }
    if (type === 'fork' || type === 'join') {
      return 'rounded=0;whiteSpace=wrap;html=1;fillColor=#0f172a;strokeColor=#0f172a;';
    }
    return 'rounded=1;arcSize=8;whiteSpace=wrap;html=1;fillColor=#ffffff;strokeColor=#2563eb;fontColor=#0f172a;fontStyle=1;';
  }

  private drawioEdgeStyle(sourceSide?: ConnectorSide, targetSide?: ConnectorSide): string {
    const style = [
      'edgeStyle=orthogonalEdgeStyle',
      'rounded=1',
      'orthogonalLoop=1',
      'jettySize=auto',
      'html=1',
      'strokeColor=#2563eb',
      'strokeWidth=2',
      'endArrow=block',
      'endFill=1',
      'fontColor=#1d4ed8',
      'fontStyle=1',
    ];

    if (sourceSide) {
      const constraint = this.sideConstraintValues(sourceSide);
      style.push(`exitX=${constraint.x}`, `exitY=${constraint.y}`);
    }
    if (targetSide) {
      const constraint = this.sideConstraintValues(targetSide);
      style.push(`entryX=${constraint.x}`, `entryY=${constraint.y}`);
    }

    return `${style.join(';')};`;
  }

  private escapeXml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  private safeFileName(value: string): string {
    return (value || 'politica')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'politica';
  }

  private downloadBlob(blob: Blob, fileName: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  private resolveLaneIdFromGeometry(x: number, y: number, type: PolicyNodeType, fallback: string | null): string | null {
    if (!this.requiresLane(type)) {
      return null;
    }

    const centerY = y + this.nodeHeight(type) / 2;
    const sizes = this.laneContentSizes();
    for (let index = 0; index < this.lanes().length; index += 1) {
      const laneTop = this.laneY(index);
      const laneHeight = sizes.get(this.lanes()[index].id)?.height ?? 128;
      if (centerY >= laneTop && centerY <= laneTop + laneHeight) {
        return this.lanes()[index].id;
      }
    }

    return fallback;
  }

  laneY(index: number): number {
    const lanes = this.lanes();
    const sizes = this.laneContentSizes();
    if (!sizes.size) {
      return 24 + index * 156;
    }
    let y = 24;
    for (let i = 0; i < index; i++) {
      y += (sizes.get(lanes[i]?.id)?.height ?? 100) + 1;
    }
    return y;
  }

  private diagramLaneWidth(): number {
    const maxRight = this.nodes().reduce((current, node) => Math.max(current, node.x + node.width), 0);
    return Math.max(1000, maxRight + 120);
  }

  private getGraphPointFromEvent(event: MouseEvent): { x: number; y: number } {
    if (this.graph && this.graphReady()) {
      const point = this.graph.getPointForEvent(event, false);
      return { x: point.x, y: point.y };
    }

    const stage = this.fallbackStage?.nativeElement;
    if (stage) {
      const rect = stage.getBoundingClientRect();
      return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
    }

    return { x: 0, y: 0 };
  }

  private finishPaletteDrag(event: MouseEvent): void {
    const dragState = this.paletteDragState;
    this.paletteDragState = null;
    this.paletteDragPreview.set(null);

    if (!dragState?.dragging || !this.isPaletteDropTarget(event)) {
      return;
    }

    if (!this.ensureCanEdit('agregar elementos')) {
      return;
    }

    const point = this.getGraphPointFromEvent(event);
    const cell = this.graph?.getCellAt(point.x, point.y);
    const laneId = this.resolveLaneIdFromCell(cell) ?? this.resolveLaneIdFromPoint(point.y);
    this.createNodeAtPoint(dragState.tool, point.x, point.y, laneId);
    this.suppressNextCanvasClick = true;
    event.preventDefault();
  }

  private isPaletteDropTarget(event: MouseEvent): boolean {
    if (this.graphReady()) {
      const container = this.graphContainer?.nativeElement;
      if (!container) {
        return false;
      }
      const rect = container.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    }

    const stage = this.fallbackStage?.nativeElement;
    if (!stage) {
      return false;
    }
    const rect = stage.getBoundingClientRect();
    return (
      event.clientX >= rect.left &&
      event.clientX <= rect.right &&
      event.clientY >= rect.top &&
      event.clientY <= rect.bottom
    );
  }

  private isInsertableNodeTool(tool: EditorTool): tool is DiagramElementType {
    return tool !== 'select' && tool !== 'pan' && tool !== 'lane' && tool !== 'edge';
  }

  private getLaneStartSize(laneCell: any): number {
    return this.graph?.getStartSize(laneCell).width ?? 28;
  }

  private toRelativeLanePoint(laneCell: any, absoluteX: number, absoluteY: number): { x: number; y: number } {
    const geometry = laneCell.getGeometry();
    const startSize = this.getLaneStartSize(laneCell);

    return {
      x: absoluteX - geometry.x - startSize,
      y: absoluteY - geometry.y,
    };
  }

  private toAbsoluteLanePoint(laneCell: any, relativeX: number, relativeY: number): { x: number; y: number } {
    const geometry = laneCell.getGeometry();
    const startSize = this.getLaneStartSize(laneCell);

    return {
      x: geometry.x + startSize + relativeX,
      y: geometry.y + relativeY,
    };
  }

  private resolveLaneIdFromCell(cell: any): string | null {
    let current = cell;

    while (current) {
      const cellId = current.getId?.();
      if (cellId && this.laneCells.has(cellId)) {
        return cellId;
      }
      current = current.getParent?.();
    }

    return null;
  }

  private resolveConnectableIdFromCell(cell: any): string | null {
    return this.resolveNodeIdFromCell(cell) ?? this.resolveLaneIdFromCell(cell);
  }

  private resolveNodeIdFromCell(cell: any): string | null {
    let current = cell;

    while (current) {
      const cellId = current.getId?.();
      if (cellId && this.nodeCells.has(cellId)) {
        return cellId;
      }
      current = current.getParent?.();
    }

    return null;
  }

  private resolveEdgeIdFromCell(cell: any): string | null {
    let current = cell;

    while (current) {
      const cellId = current.getId?.();
      if (cellId && this.edgeCells.has(cellId)) {
        return cellId;
      }
      current = current.getParent?.();
    }

    return null;
  }

  private syncLanesFromGraph(): boolean {
    const sorted = [...this.lanes()].sort((left, right) => {
      const leftY = this.laneCells.get(left.id)?.getGeometry()?.y ?? 0;
      const rightY = this.laneCells.get(right.id)?.getGeometry()?.y ?? 0;
      return leftY - rightY;
    });

    const currentOrder = this.lanes().map((lane) => lane.id).join('|');
    const nextOrder = sorted.map((lane) => lane.id).join('|');
    if (currentOrder !== nextOrder) {
      this.lanes.set(sorted);
      return true;
    }

    return false;
  }

  private nodeStyle(type: PolicyNodeType, node?: PolicyNode): Record<string, unknown> {
    const rotation = Number(node?.metadata?.['rotation'] ?? 0);
    const common = {
      strokeColor: '#2563eb',
      fontColor: '#0f172a',
      fillColor: '#ffffff',
      whiteSpace: 'wrap',
      html: 1,
      perimeter: 'rectanglePerimeter',
      rotation,
    };

    if (type === 'initial') {
      return { ...common, shape: 'ellipse', fillColor: '#0f172a', strokeColor: '#0f172a', aspect: 'fixed' };
    }
    if (type === 'final') {
      return {
        ...common,
        shape: 'umlFinal',
        fillColor: '#ffffff',
        strokeColor: '#0f172a',
        strokeWidth: 2,
        aspect: 'fixed',
      };
    }
    if (type === 'decision') {
      return { ...common, shape: 'rhombus', strokeColor: '#7c3aed' };
    }
    if (type === 'fork' || type === 'join') {
      return {
        ...common,
        shape: 'rectangle',
        fillColor: '#0f172a',
        strokeColor: '#0f172a',
        rounded: false,
      };
    }

    return { ...common, rounded: true, arcSize: 18 };
  }

  private nodeWidth(type: PolicyNodeType): number {
    if (type === 'decision') return 92;
    if (type === 'fork' || type === 'join') return 16;
    if (type === 'initial') return 34;
    if (type === 'final') return 38;
    return 160;
  }

  private nodeHeight(type: PolicyNodeType): number {
    if (type === 'decision') return 92;
    if (type === 'fork' || type === 'join') return 112;
    if (type === 'initial') return 34;
    if (type === 'final') return 38;
    return 64;
  }

  private requiresLane(type: PolicyNodeType): boolean {
    return true;
  }

  nodeTypeLabel(type: PolicyNodeType): string {
    const labels: Record<PolicyNodeType, string> = {
      initial: 'Inicio',
      activity: 'Actividad',
      decision: 'Decisión',
      fork: 'Fork',
      join: 'Join',
      final: 'Fin',
    };
    return labels[type];
  }

  toolLabel(tool: EditorTool): string {
    if (tool === 'select') return 'Selección';
    if (tool === 'pan') return 'Desplazar';
    if (tool === 'lane') return 'Calle';
    if (tool === 'edge') return 'Flujo';
    return this.nodeTypeLabel(tool);
  }

  canPanCanvas(): boolean {
    const tool = this.activeTool();
    return tool === 'pan' || (tool === 'select' && !this.selectedCellIds().length);
  }

  private handleCanvasMouseDown(event: MouseEvent): void {
    if (!this.graph || !this.graphReady() || event.button !== 0) {
      return;
    }

    if (!this.shouldEnableCanvasPan(event)) {
      return;
    }

    const view = this.graph.getView();
    this.canvasPanState = {
      startClientX: event.clientX,
      startClientY: event.clientY,
      originTranslateX: view.translate.x,
      originTranslateY: view.translate.y,
    };
    event.preventDefault();
    event.stopPropagation();
  }

  private shouldEnableCanvasPan(event: MouseEvent): boolean {
    const tool = this.activeTool();
    if (tool === 'pan') {
      return true;
    }

    if (tool !== 'select') {
      return false;
    }

    const point = this.getGraphPointFromEvent(event);
    const cell = this.graph!.getCellAt(point.x, point.y);
    return !this.resolveNodeIdFromCell(cell) && !this.resolveEdgeIdFromCell(cell);
  }

  private updateCanvasPan(event: MouseEvent): void {
    if (!this.canvasPanState || !this.graph) {
      return;
    }

    const scale = this.graph.getView().scale;
    const dx = (event.clientX - this.canvasPanState.startClientX) / scale;
    const dy = (event.clientY - this.canvasPanState.startClientY) / scale;

    this.graph.getView().setTranslate(this.canvasPanState.originTranslateX + dx, this.canvasPanState.originTranslateY + dy);
    this.scheduleConnectionOverlayRefresh();
  }

  private applyInteractionMode(): void {
    const graph = this.graph;
    const tool = this.activeTool();
    const canEdit = this.canEditPolicy();

    if (!graph) {
      return;
    }

    graph.setConnectable(false);
    graph.setCellsMovable(canEdit && tool === 'select');
    graph.setCellsEditable(canEdit);
    graph.setCellsResizable(canEdit);
    const connectionHandler = graph.getPlugin('ConnectionHandler') as ConnectionHandler | null;
    connectionHandler?.setEnabled(false);

    if (tool === 'select') {
      if (canEdit) {
        this.updateConnectionOverlay();
      } else {
        this.destroyConnectionOverlay();
      }
      return;
    }

    this.connectionDragState = null;
    this.clearConnectionTargetHighlight();
    this.hideConnectionPreview();
    this.destroyConnectionOverlay();
  }

  private applyReadOnlyMode(canEdit: boolean): void {
    const graph = this.graph;
    if (!graph) {
      return;
    }

    graph.setConnectable(false);
    graph.setCellsEditable(canEdit);
    graph.setCellsResizable(canEdit);
    graph.setCellsMovable(canEdit && this.activeTool() === 'select');

    if (!canEdit) {
      this.connectionDragState = null;
      this.paletteDragState = null;
      this.dragState = null;
      this.clearConnectionTargetHighlight();
      this.hideConnectionPreview();
      this.destroyConnectionOverlay();
      graph.clearSelection();
      this.selectedCellIds.set([]);
      if (this.activeTool() !== 'pan' && this.activeTool() !== 'select') {
        this.activeTool.set('select');
      }
      return;
    }

    this.applyInteractionMode();
  }

  private captureGraphViewport(): { scale: number; translateX: number; translateY: number; scrollLeft: number; scrollTop: number } {
    const view = this.graph?.getView();
    const container = this.graphContainer?.nativeElement;

    return {
      scale: view?.scale ?? 1,
      translateX: view?.translate.x ?? 0,
      translateY: view?.translate.y ?? 0,
      scrollLeft: container?.scrollLeft ?? 0,
      scrollTop: container?.scrollTop ?? 0,
    };
  }

  private restoreGraphViewport(viewport: {
    scale: number;
    translateX: number;
    translateY: number;
    scrollLeft: number;
    scrollTop: number;
  }): void {
    const graph = this.graph;
    const container = this.graphContainer?.nativeElement;
    if (!graph) {
      return;
    }

    const view = graph.getView();
    view.setScale(viewport.scale);
    view.setTranslate(viewport.translateX, viewport.translateY);

    if (container) {
      container.scrollLeft = viewport.scrollLeft;
      container.scrollTop = viewport.scrollTop;
    }
  }
}
