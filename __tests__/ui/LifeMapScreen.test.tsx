import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../../App';
import { LifeMapProvider } from '../../src/ui/composition/LifeMapProvider';
import { createLifeMapRuntime } from '../../src/ui/composition/createLifeMapRuntime';
import { LifeMapScreen } from '../../src/ui/map/LifeMapScreen';
import { createPortraitRoadMapLayout, createPortraitRoadMapSnapshot } from '../fixtures/portraitRoadMapFixture';

const renderSeededApp = () =>
  render(
    <SafeAreaProvider>
      <LifeMapProvider runtime={createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout())}>
        <LifeMapScreen />
      </LifeMapProvider>
    </SafeAreaProvider>,
  );

/** Routes Start → Finish a marathon, a two-path destination: the choice sheet
 * needs one extra tap on the best path before the route shows. */
const showMarathonRoad = async (screen: ReturnType<typeof render>) => {
  fireEvent.press(await screen.findByLabelText('Query roads'));
  fireEvent.changeText(screen.getByLabelText('Search destination'), 'marathon');
  fireEvent.press(await screen.findByLabelText('Find road to Finish a marathon'));
  fireEvent.press(await screen.findByLabelText('Take path 1 to Finish a marathon'));
};

describe('LifeMapScreen', () => {
  it('loads the portrait shell and exposes the main visual controls', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('The roads ahead')).toBeTruthy());
    expect(screen.getByLabelText('Query roads')).toBeTruthy();
    expect(screen.getByLabelText('Switch to Edit mode')).toBeTruthy();
    // Layers follow the pinch zoom, so there is no layer button bar anymore.
    expect(screen.queryByLabelText('Move to child segment layer')).toBeNull();
  });

  it('switches to Edit mode and opens Record capture', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Switch to Edit mode')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Switch to Edit mode'));
    const addRecord = await screen.findByLabelText('Add Record');
    fireEvent.press(addRecord);
    expect(await screen.findByText('Attach a Record')).toBeTruthy();
    expect(screen.getByLabelText('Record reflection')).toBeTruthy();
  });

  it('shows a mode-aware hint pill and hides it while a route is active', async () => {
    const screen = renderSeededApp();
    const hint = await screen.findByTestId('map-hint');
    expect(hint.props.children).toContain('Drag to move');
    fireEvent.press(screen.getByLabelText('Switch to Edit mode'));
    expect(screen.getByTestId('map-hint').props.children).toContain('Move items');
    fireEvent.press(screen.getByLabelText('Switch to Visual mode'));

    await showMarathonRoad(screen);

    expect(await screen.findByText('Started here → Finish a marathon')).toBeTruthy();
    expect(screen.queryByTestId('map-hint')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear shown road'));
    expect(await screen.findByTestId('map-hint')).toBeTruthy();
  });

  it('lists every path to a destination and activates the chosen one', async () => {
    const screen = renderSeededApp();
    fireEvent.press(await screen.findByLabelText('Query roads'));
    fireEvent.changeText(screen.getByLabelText('Search destination'), 'marathon');
    fireEvent.press(await screen.findByLabelText('Find road to Finish a marathon'));

    // Two roads lead to the marathon — best-first via Protect sleep, then via
    // Run three times — and no route is active until one is chosen.
    expect(await screen.findByText('2 paths from Started here to Finish a marathon')).toBeTruthy();
    expect(screen.getByText(/Protect sleep/)).toBeTruthy();
    expect(screen.getByText(/Run three times/)).toBeTruthy();
    expect(screen.queryByTestId('map-hint')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Take path 2 to Finish a marathon'));
    expect(await screen.findByText('Started here → Finish a marathon')).toBeTruthy();
    expect(screen.queryByTestId('map-hint')).toBeNull();
  });

  it('selects a node in Edit mode and opens its detail sheet', async () => {
    const screen = renderSeededApp();
    await waitFor(() => expect(screen.getByLabelText('Switch to Edit mode')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Switch to Edit mode'));
    const marker = await screen.findByLabelText('goal, Live in Kyoto, todo');
    fireEvent(marker, 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Save node')).toBeTruthy();
  });

  it('connects a node to an existing forward node by dragging the path handle', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    // At the default zoom only Start and the top-rank goals are visible; Live in
    // Kyoto is the fixture's isolated landmark with no road from Start yet.
    expect((await runtime.findRoad('start', 'move-kyoto')).status).toBe('unreachable');

    fireEvent(screen.getByLabelText('Status, Started here, success'), 'responderRelease', { nativeEvent: {} });
    const handle = await screen.findByLabelText('Drag to connect from Started here');

    const centerOf = (label: string, half: number) => {
      const style = StyleSheet.flatten(screen.getByLabelText(label).props.style);
      return { x: style.left + half, y: style.top + half };
    };
    const from = centerOf('Drag to connect from Started here', 22);
    const to = centerOf('goal, Live in Kyoto, todo', 24);

    // PanResponder reads event.touchHistory, which synthetic events lack — fake
    // the single-touch track so gesture dx/dy come out as to - from.
    const touchEvent = (point: { x: number; y: number }, timestamp: number, previous?: { x: number; y: number; timestamp: number }) => ({
      nativeEvent: { touches: [{ pageX: point.x, pageY: point.y, locationX: point.x, locationY: point.y, identifier: 1, target: 0, timestamp }] },
      touchHistory: {
        touchBank: [{
          touchActive: true,
          currentPageX: point.x,
          currentPageY: point.y,
          previousPageX: previous?.x ?? point.x,
          previousPageY: previous?.y ?? point.y,
          currentTimeStamp: timestamp,
          previousTimeStamp: previous?.timestamp ?? timestamp,
        }],
        numberActiveTouches: 1,
        indexOfSingleActiveTouch: 0,
        mostRecentTimeStamp: timestamp,
      },
    });

    fireEvent(handle, 'responderGrant', touchEvent(from, 50));
    fireEvent(handle, 'responderMove', touchEvent(to, 100, { ...from, timestamp: 50 }));
    fireEvent(handle, 'responderRelease', touchEvent(to, 150, { ...from, timestamp: 50 }));

    expect(await screen.findByText('New segment: Started here → Live in Kyoto')).toBeTruthy();
    expect((await runtime.findRoad('start', 'move-kyoto')).status).toBe('found');
  });

  it('validates the composer before creating from a blank long-press', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByLabelText('Switch to Edit mode')).toBeTruthy());
    fireEvent.press(screen.getByLabelText('Switch to Edit mode'));
    fireEvent(screen.getByLabelText('Life Map canvas'), 'longPress', { nativeEvent: { locationX: 60, locationY: 60 } });
    expect(await screen.findByText('Add a planned point')).toBeTruthy();
    const submit = screen.getByLabelText('Add planned point to the map');
    expect(submit.props.accessibilityState?.disabled ?? false).toBe(false);
    fireEvent.changeText(screen.getByLabelText('New node title'), '   ');
    expect(screen.getByLabelText('Add planned point to the map').props.accessibilityState.disabled).toBe(true);
  });

  it('shows a node created from a blank long-press while zoomed out', async () => {
    // The default camera sits at semantic level 0, which hides every non-top
    // rank — the created node must still become visible after submitting.
    const screen = renderSeededApp();
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));
    fireEvent(screen.getByLabelText('Life Map canvas'), 'longPress', { nativeEvent: { locationX: 195, locationY: 700 } });
    fireEvent.changeText(await screen.findByLabelText('New node title'), 'Test landmark');
    fireEvent.press(screen.getByLabelText('Add planned point to the map'));
    expect(await screen.findByLabelText('task, Test landmark, todo')).toBeTruthy();
  });

  it('creates a node inside the segment layer under the long-press point', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    // (195, 700) sits inside the root corridor's member area at level 0, away
    // from markers and roads.
    fireEvent(screen.getByLabelText('Life Map canvas'), 'longPress', { nativeEvent: { locationX: 195, locationY: 700 } });
    fireEvent.changeText(await screen.findByLabelText('New node title'), 'Frame point');
    fireEvent.press(screen.getByLabelText('Add planned point to the map'));
    expect(await screen.findByLabelText('task, Frame point, todo')).toBeTruthy();

    const projection = await runtime.load({
      viewport: { width: 390, height: 700 },
      camera: { centerX: 195, centerY: 360, scale: 0.7 },
      semanticLevel: 0,
    });
    expect(projection.segmentOverlays.find((overlay) => overlay.id === 'marathon-journey')?.memberCount).toBe(11);
  });

  it('extracts a tapped connection into its own deeper segment in Edit mode', async () => {
    // The seed already files r5 into an atomic single-connection segment, so
    // drop that segment to exercise a genuinely un-extracted edge.
    const snapshot = createPortraitRoadMapSnapshot();
    snapshot.segments = snapshot.segments.filter((segment) => segment.id !== 'marathon-weekly-base-atomic-r5');
    const runtime = createLifeMapRuntime(snapshot, createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    // Route finding zooms the camera to the deepest filed layer the route
    // touches — the atomic level for this road — so connections can be tapped.
    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    // Tapping the edge extracts it: no separate button press is needed.
    fireEvent.press(await screen.findByTestId('connection-hit-r5'));
    expect(await screen.findByText('Sub-segment created from connection')).toBeTruthy();

    // The detail sheet reopens on the extracted edge, keeping bend/insert reachable.
    // (The meaning text also renders as the on-canvas edge label, so the
    // sheet-specific metadata is the reliable signal that the sheet opened.)
    expect(await screen.findByText('Endpoint outcome')).toBeTruthy();
    expect(screen.getByText('Bend left')).toBeTruthy();

    // The camera stepped into the atomic layer where the new segment lives.
    const projection = await runtime.load({
      viewport: { width: 390, height: 700 },
      camera: { centerX: 195, centerY: 360, scale: 2 },
      semanticLevel: 4,
    });
    expect(projection.segmentOverlays.some((overlay) => overlay.title === 'Build weekly base → Run three times')).toBe(true);

    // Tapping the already-extracted edge again reuses its segment instead of
    // nesting a redundant one.
    fireEvent.press(await screen.findByTestId('connection-hit-r5'));
    await screen.findByText('Sub-segment created from connection');
    const segmentTitles = (await runtime.segmentOptions()).map((segment) => segment.title);
    expect(segmentTitles.filter((title) => title === 'Build weekly base → Run three times')).toHaveLength(1);
  });

  it('reuses the existing atomic segment when the tapped edge is already extracted', async () => {
    // In the stock seed r5 is already filed as the sole connection of
    // 'marathon-weekly-base-atomic-r5', so tapping it must not file anything.
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    const before = (await runtime.segmentOptions()).map((segment) => segment.id);
    fireEvent.press(await screen.findByTestId('connection-hit-r5'));
    await screen.findByText('Endpoint outcome');
    const after = (await runtime.segmentOptions()).map((segment) => segment.id);
    expect(after).toEqual(before);
  });

  it('extracts an edge by tapping its two endpoint nodes in Edit mode', async () => {
    // The seed already files r5 into an atomic single-connection segment, so
    // drop that segment to exercise a genuinely un-extracted edge.
    const snapshot = createPortraitRoadMapSnapshot();
    snapshot.segments = snapshot.segments.filter((segment) => segment.id !== 'marathon-weekly-base-atomic-r5');
    const runtime = createLifeMapRuntime(snapshot, createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    // First endpoint tap arms it and selects the node as usual; the second
    // endpoint tap selects the edge between them — which edit mode extracts.
    fireEvent(await screen.findByLabelText('task, Build weekly base, success'), 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Save node')).toBeTruthy();
    fireEvent(await screen.findByLabelText('task, Run three times, success'), 'responderRelease', { nativeEvent: {} });

    expect(await screen.findByText('Sub-segment created from connection')).toBeTruthy();
    expect(await screen.findByText('Endpoint outcome')).toBeTruthy();
    const projection = await runtime.load({
      viewport: { width: 390, height: 700 },
      camera: { centerX: 195, centerY: 360, scale: 2 },
      semanticLevel: 4,
    });
    expect(projection.segmentOverlays.some((overlay) => overlay.title === 'Build weekly base → Run three times')).toBe(true);
  });

  it('treats a second endpoint tap with no shared edge as a plain node select', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    // No edge runs between Build weekly base and the 10K checkpoint, so the
    // second tap selects the node instead of extracting anything.
    fireEvent(await screen.findByLabelText('task, Build weekly base, success'), 'responderRelease', { nativeEvent: {} });
    await screen.findByText('Save node');
    fireEvent(await screen.findByLabelText('Status, 10K checkpoint, failed'), 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Save node')).toBeTruthy();
    expect(screen.queryByText('Sub-segment created from connection')).toBeNull();
  });

  it('cancels the pending edge-start endpoint on a blank canvas tap', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    fireEvent(await screen.findByLabelText('task, Build weekly base, success'), 'responderRelease', { nativeEvent: {} });
    await screen.findByText('Save node');
    fireEvent.press(screen.getByLabelText('Life Map canvas'), { nativeEvent: { locationX: 195, locationY: 300 } });

    // The pending start was cancelled, so the second node tap selects the node.
    fireEvent(await screen.findByLabelText('task, Run three times, success'), 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Save node')).toBeTruthy();
    expect(screen.queryByText('Sub-segment created from connection')).toBeNull();
  });

  it('selects an edge by tapping its two endpoint nodes in Visual mode without extracting', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );

    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    fireEvent.press(await screen.findByLabelText('task, Build weekly base, success'));
    fireEvent.press(await screen.findByLabelText('task, Run three times, success'));

    expect(await screen.findByText('Endpoint outcome')).toBeTruthy();
    expect(screen.queryByText('Sub-segment created from connection')).toBeNull();
    const segmentTitles = (await runtime.segmentOptions()).map((segment) => segment.title);
    expect(segmentTitles).not.toContain('Build weekly base → Run three times');
  });

  it('keeps tap-to-select on connections in Visual mode without extracting', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );

    // Same deep camera as the Edit-mode test, but the mode stays Visual.
    await showMarathonRoad(screen);
    fireEvent.press(await screen.findByLabelText('Clear shown road'));

    fireEvent.press(await screen.findByTestId('connection-hit-r5'));

    // The detail sheet opens (its metadata is sheet-specific — the meaning
    // text also renders as the on-canvas edge label), and nothing is filed.
    expect(await screen.findByText('Endpoint outcome')).toBeTruthy();
    expect(screen.queryByText('Sub-segment created from connection')).toBeNull();
    const segmentTitles = (await runtime.segmentOptions()).map((segment) => segment.title);
    expect(segmentTitles).not.toContain('Build weekly base → Run three times');
  });

  it('files an unfiled node into a layer from the node sheet', async () => {
    const runtime = createLifeMapRuntime(createPortraitRoadMapSnapshot(), createPortraitRoadMapLayout());
    const screen = render(
      <SafeAreaProvider>
        <LifeMapProvider runtime={runtime}>
          <LifeMapScreen />
        </LifeMapProvider>
      </SafeAreaProvider>,
    );
    fireEvent.press(await screen.findByLabelText('Switch to Edit mode'));

    // The Kyoto idea is in no segment, so it sits at layer 0 until filed.
    fireEvent(screen.getByLabelText('task, Explore Kyoto move, todo'), 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Move to layer')).toBeTruthy();
    fireEvent.press(screen.getByText('Direction'));
    expect(await screen.findByText('Moved to a new layer')).toBeTruthy();

    const request = { viewport: { width: 390, height: 700 }, camera: { centerX: 195, centerY: 360, scale: 0.7 } };
    const overview = await runtime.load({ ...request, semanticLevel: 0 });
    expect(overview.diagnostics.hiddenNodeIds).toContain('explore-kyoto');
    const childLayer = await runtime.load({ ...request, semanticLevel: 1 });
    expect(childLayer.diagnostics.visibleNodeIds).toContain('explore-kyoto');
  });
});
