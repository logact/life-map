jest.mock('react-native-safe-area-context', () => {
  const mockReact = require('react');
  const { View: MockView } = require('react-native');
  return {
    SafeAreaProvider: ({ children }) => mockReact.createElement(mockReact.Fragment, null, children),
    SafeAreaView: ({ children, ...props }) => mockReact.createElement(MockView, props, children),
    useSafeAreaInsets: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
  };
});
