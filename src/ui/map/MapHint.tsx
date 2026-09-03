import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SessionMode } from './useLifeMapSession';
import { mapTheme } from './mapTheme';

interface MapHintProps {
  mode: SessionMode;
  level: number;
  scale: number;
  routeActive: boolean;
}

export const MapHint = ({ mode, level, scale, routeActive }: MapHintProps) => {
  if (routeActive) return null;
  const copy = mode === 'visual'
    ? `Drag to move · pinch through layers · L${level} · ${Math.round(scale * 100)}%`
    : 'Move items · hold blank or drag ↗ to create · tap two endpoints to select their edge';
  return (
    <View pointerEvents="none" style={styles.hint}>
      <Text testID="map-hint" style={styles.copy}>{copy}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  hint: { position: 'absolute', top: 56, alignSelf: 'center', maxWidth: '72%', paddingHorizontal: 12, minHeight: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,253,248,0.94)', shadowColor: mapTheme.shadow, shadowOpacity: 0.22, shadowRadius: 6 },
  copy: { color: mapTheme.muted, fontSize: 9, fontWeight: '700', textAlign: 'center' },
});
