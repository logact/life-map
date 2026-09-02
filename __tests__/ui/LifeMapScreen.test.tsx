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
});
