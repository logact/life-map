export const mapTheme = {
  paper: '#f6f0e3',
  paperStrong: '#fffdf8',
  forest: '#255c4c',
  forestDark: '#173f35',
  sage: '#7ca289',
  sagePale: '#dce9df',
  gold: '#d09234',
  goldPale: '#f4dfb3',
  violet: '#765a98',
  violetPale: '#e7ddf0',
  failed: '#a35248',
  failedPale: '#efd6d1',
  ink: '#183e34',
  muted: '#6d786f',
  faint: '#9da49c',
  shadow: 'rgba(26, 61, 50, 0.16)',
} as const;

export const outcomeColor = {
  success: mapTheme.sage,
  todo: mapTheme.gold,
  failed: mapTheme.failed,
} as const;
