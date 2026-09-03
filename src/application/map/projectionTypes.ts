import { Outcome, PlannedKind } from '../../domain/lifeMap/entities';

export interface MapViewport {
  width: number;
  height: number;
  safeTop?: number;
  safeBottom?: number;
}

export interface MapCamera {
  centerX: number;
  centerY: number;
  scale: number;
}

export interface WorldPoint {
  x: number;
  y: number;
}

export interface ScreenPoint {
  x: number;
  y: number;
}

export interface ProjectedNode extends ScreenPoint {
  id: string;
  title: string;
  description: string;
  kind: PlannedKind;
  outcome: Outcome;
  permanent?: boolean;
  worldX: number;
  worldY: number;
  depthRank: number;
  showLabel: boolean;
  filtered: boolean;
  onActiveRoute: boolean;
}

export interface ProjectedConnection {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  meaning: string;
  outcome: Outcome;
  from: ScreenPoint;
  to: ScreenPoint;
  control: ScreenPoint;
  filtered: boolean;
  onActiveRoute: boolean;
}

export interface SummaryOutcomeSection {
  outcome: Outcome;
  connectionIds: string[];
}

export interface ProjectedSummaryConnection extends ProjectedConnection {
  kind: 'summary';
  roadId: string;
  segmentId: string;
  hiddenNodeIds: string[];
  hiddenConnectionIds: string[];
  hiddenCount: number;
  sections: SummaryOutcomeSection[];
}

export interface ProjectedSegmentOverlay {
  id: string;
  roadId?: string;
  title: string;
  description: string;
  tone?: 'foundation' | 'distance' | 'readiness';
  hierarchyLevel: number;
  /** Ancestor layer kept as context while viewing a deeper level — rendered faint, not tappable. */
  dimmed?: boolean;
  memberCount: number;
  bounds: { x: number; y: number; width: number; height: number };
}

export interface ProjectedRecordAttachment {
  id: string;
  targetId: string;
  summary: string;
  content?: string;
  occurredAt: string;
  from: ScreenPoint;
  to: ScreenPoint;
  filtered: boolean;
}

export interface HeaderSummary {
  title: string;
  detail: string;
  activeRoute: boolean;
}

export interface ProjectionDiagnostics {
  semanticLevel: number;
  visibleNodeIds: string[];
  hiddenNodeIds: string[];
  optionalLabelNodeIds: string[];
  summaryCount: number;
  worldCenter: WorldPoint;
}

export interface PortraitMapProjection {
  nodes: ProjectedNode[];
  connections: ProjectedConnection[];
  summaryConnections: ProjectedSummaryConnection[];
  segmentOverlays: ProjectedSegmentOverlay[];
  recordAttachments: ProjectedRecordAttachment[];
  headerSummary: HeaderSummary;
  diagnostics: ProjectionDiagnostics;
}

export interface ActiveRouteProjection {
  nodeIds: string[];
  connectionIds: string[];
  failedEndpointCount: number;
}
