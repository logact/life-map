import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { PanResponder } from 'react-native';
import App from '../../App';
import { MemoryLifeMapRepository } from '../../src/infrastructure/memory/MemoryLifeMapRepository';

const pinchEvent = (first: { x: number; y: number }, second: { x: number; y: number }) => ({
  nativeEvent: {
    touches: [
      { identifier: 1, pageX: first.x, pageY: first.y, locationX: first.x, locationY: first.y },
      { identifier: 2, pageX: second.x, pageY: second.y, locationX: second.x, locationY: second.y },
    ],
    locationX: (first.x + second.x) / 2,
    locationY: (first.y + second.y) / 2,
  },
});

const dragEvent = (point: { x: number; y: number }) => ({
  nativeEvent: {
    touches: [{ identifier: 1, pageX: point.x, pageY: point.y, locationX: point.x, locationY: point.y }],
    locationX: point.x,
    locationY: point.y,
  },
});

// PanResponder's own plumbing reads a native touch history that does not exist
// in Jest, so the test drives the map's PanResponder config callbacks directly.
const findMapGestureConfig = (spy: jest.SpyInstance) =>
  spy.mock.calls
    .map(([config]) => config)
    .find((config) => config.onMoveShouldSetPanResponder?.(pinchEvent({ x: 140, y: 300 }, { x: 200, y: 300 }), { dx: 0, dy: 0 }) === true);

describe('map pinch gesture', () => {
  it('claims a two-finger move without centroid travel and zooms the camera', async () => {
    const spy = jest.spyOn(PanResponder, 'create');
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('The roads ahead')).toBeTruthy());
    const hint = await screen.findByTestId('map-hint');
    expect(hint.props.children).toContain('L0 · 70%');

    // A pure pinch starts with the centroid fixed (dx = dy = 0): the map must
    // still claim the responder from the inner Pressable.
    const config = findMapGestureConfig(spy);
    expect(config).toBeTruthy();

    act(() => config.onPanResponderGrant(pinchEvent({ x: 140, y: 300 }, { x: 200, y: 300 })));
    // Doubling the finger distance doubles the scale: 0.7 → 1.4 (layer 2).
    act(() => config.onPanResponderMove(pinchEvent({ x: 110, y: 300 }, { x: 230, y: 300 })));

    await waitFor(() => expect(screen.getByTestId('map-hint').props.children).toContain('L2 · 140%'));
    spy.mockRestore();
  });
});

describe('map pan gesture', () => {
  it('re-projects synchronously without reloading repository data', async () => {
    const panResponderSpy = jest.spyOn(PanResponder, 'create');
    const loadSpy = jest.spyOn(MemoryLifeMapRepository.prototype, 'load');
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('The roads ahead')).toBeTruthy());
    const config = findMapGestureConfig(panResponderSpy);
    expect(config).toBeTruthy();

    // The map is fully loaded; dragging must move the camera from cached data.
    // Reloading per move event painted stale projections and flickered.
    loadSpy.mockClear();
    act(() => config.onPanResponderGrant(dragEvent({ x: 200, y: 300 })));
    act(() => config.onPanResponderMove(dragEvent({ x: 170, y: 290 })));
    act(() => config.onPanResponderMove(dragEvent({ x: 140, y: 280 })));

    expect(loadSpy).not.toHaveBeenCalled();
    panResponderSpy.mockRestore();
    loadSpy.mockRestore();
  });

  it('locks the single-finger pan while an edit drag handle is on screen', async () => {
    const spy = jest.spyOn(PanResponder, 'create');
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Switch to Edit mode')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Switch to Edit mode'));
    // Select the origin, then close the sheet: the selection (and its drag
    // handle) survives, and the map pan must not steal the handle's drag.
    fireEvent(screen.getByLabelText('Status, Started here, success'), 'responderRelease', { nativeEvent: {} });
    fireEvent.press(await screen.findByLabelText('Close sheet'));

    const config = (spy as jest.SpyInstance).mock.calls
      .map(([config]) => config)
      .find((config) => config.onStartShouldSetPanResponder?.() === false);
    expect(config).toBeTruthy();
    expect(config.onMoveShouldSetPanResponder(dragEvent({ x: 200, y: 300 }), { dx: 10, dy: 10 })).toBe(false);
    // Pinch zoom is unaffected, so far-away targets stay reachable.
    expect(config.onMoveShouldSetPanResponder(pinchEvent({ x: 140, y: 300 }, { x: 200, y: 300 }), { dx: 0, dy: 0 })).toBe(true);
    spy.mockRestore();
  });
});
