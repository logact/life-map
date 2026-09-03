import { useReducer } from 'react';
import { MapCamera } from '../../application/map/projectionTypes';
import { Outcome, PlannedKind } from '../../domain/lifeMap/entities';
import { RoadSearchResult } from '../../application/map/FindRoadService';
import { resetCamera } from '../../application/map/camera';
import { semanticLevelForScale } from '../../application/map/semanticZoom';

export type SessionMode = 'visual' | 'edit';
export type SheetKind = 'detail' | 'route' | 'legend' | 'record' | 'composer' | undefined;
export interface Selection { type: 'node' | 'connection' | 'record' | 'summary'; id: string }

export interface DraftPath {
  fromNodeId: string;
  x: number;
  y: number;
  targetNodeId?: string;
}

export interface ComposerPoint {
  worldX: number;
  depthRank: number;
  fromNodeId?: string;
  segmentId?: string;
  connectionId?: string;
}

export interface ComposerDraft {
  title: string;
  kind: PlannedKind;
  outcome: Outcome;
}

export interface LifeMapSessionState {
  mode: SessionMode;
  /** Derived from camera.scale via semanticLevelForScale — pinch zoom is the only layer control. */
  semanticLevel: number;
  camera: MapCamera;
  filters: Outcome[];
  selection?: Selection;
  sheet?: SheetKind;
  sheetHeight: number;
  activeRoute?: RoadSearchResult;
  deleteArmedId?: string;
  composerPoint?: ComposerPoint;
  composerDraft?: ComposerDraft;
  draftPath?: DraftPath;
  /** Node tapped as the pending start endpoint for two-tap edge selection. */
  edgeStartNodeId?: string;
  toast?: string;
}

export type SessionAction =
  | { type: 'set-mode'; mode: SessionMode }
  | { type: 'set-camera'; camera: MapCamera }
  | { type: 'toggle-filter'; outcome: Outcome }
  | { type: 'select'; selection: Selection; sheet?: SheetKind }
  | { type: 'open-sheet'; sheet: Exclude<SheetKind, undefined> }
  | { type: 'close-sheet' }
  | { type: 'show-route'; route: RoadSearchResult }
  | { type: 'clear-route' }
  | { type: 'arm-delete'; id: string }
  | { type: 'open-composer'; point: ComposerPoint }
  | { type: 'set-composer-draft'; draft: ComposerDraft }
  | { type: 'set-draft-path'; draft?: DraftPath }
  | { type: 'set-edge-start'; id?: string }
  | { type: 'set-sheet-height'; height: number }
  | { type: 'toast'; message?: string }
  | { type: 'reset-camera' };

const initialCamera = resetCamera();

export const initialLifeMapSession: LifeMapSessionState = {
  mode: 'visual',
  semanticLevel: semanticLevelForScale(initialCamera.scale),
  camera: initialCamera,
  filters: ['success', 'todo', 'failed'],
  sheetHeight: 0,
};

export const lifeMapSessionReducer = (state: LifeMapSessionState, action: SessionAction): LifeMapSessionState => {
  switch (action.type) {
    case 'set-mode':
      return { ...state, mode: action.mode, sheet: undefined, selection: undefined, deleteArmedId: undefined, composerPoint: undefined, composerDraft: undefined, draftPath: undefined, edgeStartNodeId: undefined };
    case 'set-camera':
      return { ...state, camera: action.camera, semanticLevel: semanticLevelForScale(action.camera.scale) };
    case 'toggle-filter': {
      const enabled = state.filters.includes(action.outcome);
      const filters = enabled ? state.filters.filter((outcome) => outcome !== action.outcome) : [...state.filters, action.outcome];
      return { ...state, filters };
    }
    case 'select':
      return { ...state, selection: action.selection, sheet: action.sheet ?? 'detail', deleteArmedId: undefined, draftPath: undefined };
    case 'open-sheet':
      return { ...state, sheet: action.sheet, deleteArmedId: undefined };
    case 'close-sheet':
      return { ...state, sheet: undefined, deleteArmedId: undefined, composerPoint: undefined, composerDraft: undefined };
    case 'show-route':
      return { ...state, activeRoute: action.route, sheet: undefined };
    case 'clear-route':
      return { ...state, activeRoute: undefined };
    case 'arm-delete':
      return { ...state, deleteArmedId: action.id };
    case 'open-composer':
      return { ...state, sheet: 'composer', composerPoint: action.point, composerDraft: undefined, draftPath: undefined };
    case 'set-composer-draft':
      return { ...state, composerDraft: action.draft };
    case 'set-draft-path':
      return { ...state, draftPath: action.draft };
    case 'set-edge-start':
      return { ...state, edgeStartNodeId: action.id };
    case 'set-sheet-height':
      return Math.abs(state.sheetHeight - action.height) < 1 ? state : { ...state, sheetHeight: action.height };
    case 'toast':
      return { ...state, toast: action.message };
    case 'reset-camera': {
      const camera = resetCamera();
      return { ...state, camera, semanticLevel: semanticLevelForScale(camera.scale) };
    }
  }
};

export const useLifeMapSession = () => useReducer(lifeMapSessionReducer, initialLifeMapSession);
