import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';
import { SessionMode } from './useLifeMapSession';
import { mapTheme } from './mapTheme';

interface MapControlsProps {
  mode: SessionMode;
  onMode: (mode: SessionMode) => void;
  onResetLayout: () => void;
}

export const MapControls = ({ mode, onMode, onResetLayout }: MapControlsProps) => (
  <>
    <View style={styles.modeControl}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={mode === 'visual' ? 'Switch to Edit mode' : 'Switch to Visual mode'}
        accessibilityState={{ selected: mode === 'edit' }}
        onPress={() => onMode(mode === 'visual' ? 'edit' : 'visual')}
        style={[styles.modeButton, mode === 'edit' && styles.activeMode]}
      >
        <PencilIcon color={mode === 'edit' ? mapTheme.paperStrong : mapTheme.forest} />
      </Pressable>
    </View>
    {mode === 'edit' && (
      <View style={styles.cameraControl}>
        <RoundButton label="Reset editable placements" text="↺" onPress={onResetLayout} />
      </View>
    )}
  </>
);

/** Pencil toggle for Visual/Edit mode (Feather-style edit glyph). */
const PencilIcon = ({ color }: { color: string }) => (
  <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
    <Path
      d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

const RoundButton = ({ label, text, onPress, disabled }: { label: string; text: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.roundButton, disabled && styles.disabled]}>
    <Text style={styles.roundText}>{text}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  modeControl: { position: 'absolute', left: 12, top: 10 },
  modeButton: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(37,92,76,0.16)', backgroundColor: 'rgba(255,253,248,0.95)', shadowColor: mapTheme.shadow, shadowOpacity: 0.2, shadowRadius: 5 },
  activeMode: { backgroundColor: mapTheme.forest },
  cameraControl: { position: 'absolute', right: 12, top: 10, gap: 7 },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(37,92,76,0.16)', backgroundColor: 'rgba(255,253,248,0.95)', shadowColor: mapTheme.shadow, shadowOpacity: 0.2, shadowRadius: 5 },
  roundText: { color: mapTheme.forest, fontSize: 19, fontWeight: '800' },
  disabled: { opacity: 0.35 },
});
