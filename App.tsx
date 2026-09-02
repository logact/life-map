import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LifeMapProvider } from './src/ui/composition/LifeMapProvider';
import { LifeMapScreen } from './src/ui/map/LifeMapScreen';

export default function App() {
  return (
    <SafeAreaProvider>
      <LifeMapProvider>
        <LifeMapScreen />
      </LifeMapProvider>
    </SafeAreaProvider>
  );
}
