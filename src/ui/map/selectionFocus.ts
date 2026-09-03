import { PortraitMapProjection, ScreenPoint } from '../../application/map/projectionTypes';
import { quadraticPointAt } from './mapGeometry';
import { Selection } from './useLifeMapSession';

/**
 * Screen-space anchor of a selection, used to keep the selected item visible
 * above the open bottom sheet via focusCameraAboveSheet.
 */
export const selectionFocusPoint = (selection: Selection, projection: PortraitMapProjection): ScreenPoint | undefined => {
  if (selection.type === 'node') {
    const node = projection.nodes.find((candidate) => candidate.id === selection.id);
    return node ? { x: node.x, y: node.y } : undefined;
  }
  if (selection.type === 'connection' || selection.type === 'summary') {
    const connection = selection.type === 'connection'
      ? projection.connections.find((candidate) => candidate.id === selection.id)
      : projection.summaryConnections.find((candidate) => candidate.id === selection.id);
    return connection ? quadraticPointAt(connection.from, connection.control, connection.to, 0.5) : undefined;
  }
  const record = projection.recordAttachments.find((candidate) => candidate.id === selection.id);
  return record ? record.from : undefined;
};
