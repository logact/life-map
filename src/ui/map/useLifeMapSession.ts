import { useReducer } from 'react';
import { MapCamera } from '../../application/map/projectionTypes';
import { Outcome } from '../../domain/lifeMap/entities';
import { RoadSearchResult } from '../../application/map/FindRoadService';
import { resetCamera } from '../../application/map/camera';

export type SessionMode = 'visual' | 'edit';
export type SheetKind = 'detail' | 'route' | 'legend' | 'record' | 'composer' | undefined;
export interface Selection { type: 'node' | 'connection' | 'segment' | 'record' | 'summary'; id: string }

export interface LifeMapSessionState {
  mode: SessionMode;
  semanticLevel: number;
  camera: MapCamera;
  filters: Outcome[];
  selection?: Selection;
  sheet?: SheetKind;
  activeRoute?: RoadSearchResult;
  deleteArmedId?: string;
  composerPoint?: { worldX: number; depthRank: number; fromNodeId?: string; segmentId?: string };
  toast?: string;
}

export type SessionAction =
  | { type: 'set-mode'; mode: SessionMode }
  | { type: 'set-level'; level: number }
  | { type: 'set-camera'; camera: MapCamera }
  | { type: 'toggle-filter'; outcome: Outcome }
  | { type: 'select'; selection: Selection; sheet?: SheetKind }
  | { type: 'open-sheet'; sheet: Exclude<SheetKind, undefined> }
  | { type: 'close-sheet' }
  | { type: 'show-route'; route: RoadSearchResult }
  | { type: 'clear-route' }
  | { type: 'arm-delete'; id: string }
  | { type: 'open-composer'; point: NonNullable<LifeMapSessionState['composerPoint']> }
  | { type: 'toast'; message?: string }
  | { type: 'reset-camera' };

export const initialLifeMapSession: LifeMapSessionState = {
  mode: 'visual',
  semanticLevel: 0,
  camera: resetCamera(),
  filters: ['success', 'todo', 'failed'],
};

export const lifeMapSessionReducer = (state: LifeMapSessionState, action: SessionAction): LifeMapSessionState => {
  switch (action.type) {
    case 'set-mode':
      return { ...state, mode: action.mode, sheet: undefined, selection: undefined, deleteArmedId: undefined, composerPoint: undefined };
    case 'set-level':
      return { ...state, semanticLevel: Math.max(0, Math.min(4, action.level)), sheet: undefined, selection: undefined };
    case 'set-camera':
      return { ...state, camera: action.camera };
    case 'toggle-filter': {
      const enabled = state.filters.includes(action.outcome);
      const filters = enabled ? state.filters.filter((outcome) => outcome !== action.outcome) : [...state.filters, action.outcome];
      return { ...state, filters };
    }
    case 'select':
      return { ...state, selection: action.selection, sheet: action.sheet ?? 'detail', deleteArmedId: undefined };
    case 'open-sheet':
      return { ...state, sheet: action.sheet, deleteArmedId: undefined };
    case 'close-sheet':
      return { ...state, sheet: undefined, deleteArmedId: undefined, composerPoint: undefined };
    case 'show-route':
      return { ...state, activeRoute: action.route, sheet: undefined, semanticLevel: Math.max(state.semanticLevel, action.route.requiredSemanticLevel) };
    case 'clear-route':
      return { ...state, activeRoute: undefined };
    case 'arm-delete':
      return { ...state, deleteArmedId: action.id };
    case 'open-composer':
      return { ...state, sheet: 'composer', composerPoint: action.point };
    case 'toast':
      return { ...state, toast: action.message };
    case 'reset-camera':
      return { ...state, camera: resetCamera() };
  }
};

export const useLifeMapSession = () => useReducer(lifeMapSessionReducer, initialLifeMapSession);
