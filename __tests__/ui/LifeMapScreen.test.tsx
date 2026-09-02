import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import App from '../../App';

describe('LifeMapScreen', () => {
  it('loads the portrait shell and exposes the main visual controls', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('The roads ahead')).toBeTruthy());
    expect(screen.getByLabelText('Find a road')).toBeTruthy();
    expect(screen.getByLabelText('Legend and filters')).toBeTruthy();
    expect(screen.getByLabelText('Move to child segment layer')).toBeTruthy();
  });

  it('switches to Edit mode and opens Record capture', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.press(screen.getByText('Edit'));
    const addRecord = await screen.findByLabelText('Add Record');
    fireEvent.press(addRecord);
    expect(await screen.findByText('Attach a Record')).toBeTruthy();
    expect(screen.getByLabelText('Record reflection')).toBeTruthy();
  });

  it('shows a mode-aware hint pill and hides it while a route is active', async () => {
    const screen = render(<App />);
    const hint = await screen.findByTestId('map-hint');
    expect(hint.props.children).toContain('Drag to move');
    fireEvent.press(screen.getByText('Edit'));
    expect(screen.getByTestId('map-hint').props.children).toContain('Move items');
    fireEvent.press(screen.getByText('Visual'));

    fireEvent.press(screen.getByLabelText('Find a road'));
    fireEvent.changeText(screen.getByLabelText('Search destination'), 'marathon');
    fireEvent.press(await screen.findByLabelText('Find road to Finish a marathon'));

    expect(await screen.findByText('Started here → Finish a marathon')).toBeTruthy();
    expect(screen.queryByTestId('map-hint')).toBeNull();

    fireEvent.press(screen.getByLabelText('Clear shown road'));
    expect(await screen.findByTestId('map-hint')).toBeTruthy();
  });

  it('selects a node in Edit mode and opens its detail sheet', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.press(screen.getByText('Edit'));
    const marker = await screen.findByLabelText('goal, Live in Kyoto, todo');
    fireEvent(marker, 'responderRelease', { nativeEvent: {} });
    expect(await screen.findByText('Save node')).toBeTruthy();
  });

  it('validates the composer before creating from a blank long-press', async () => {
    const screen = render(<App />);
    await waitFor(() => expect(screen.getByText('Edit')).toBeTruthy());
    fireEvent.press(screen.getByText('Edit'));
    fireEvent(screen.getByLabelText('Life Map canvas'), 'longPress', { nativeEvent: { locationX: 60, locationY: 60 } });
    expect(await screen.findByText('Add a planned point')).toBeTruthy();
    const submit = screen.getByLabelText('Add planned point to the map');
    expect(submit.props.accessibilityState?.disabled ?? false).toBe(false);
    fireEvent.changeText(screen.getByLabelText('New node title'), '   ');
    expect(screen.getByLabelText('Add planned point to the map').props.accessibilityState.disabled).toBe(true);
  });
});
