import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SessionMode } from './useLifeMapSession';
import { mapTheme } from './mapTheme';

interface MapControlsProps {
  mode: SessionMode;
  level: number;
  onMode: (mode: SessionMode) => void;
  onLevel: (level: number) => void;
  onCameraZoom: (factor: number) => void;
  onResetLayout: () => void;
}

export const MapControls = ({ mode, level, onMode, onLevel, onCameraZoom, onResetLayout }: MapControlsProps) => (
  <>
    <View style={styles.modeControl}>
      {(['visual', 'edit'] as const).map((candidate) => (
        <Pressable
          key={candidate}
          accessibilityRole="button"
          accessibilityState={{ selected: mode === candidate }}
          onPress={() => onMode(candidate)}
          style={[styles.modeButton, mode === candidate && styles.activeMode]}
        >
          <Text style={[styles.modeText, mode === candidate && styles.activeModeText]}>{candidate === 'visual' ? 'Visual' : 'Edit'}</Text>
        </Pressable>
      ))}
    </View>
    <View style={styles.cameraControl}>
      <RoundButton label="Zoom camera out" text="−" onPress={() => onCameraZoom(0.84)} />
      <RoundButton label="Zoom camera in" text="+" onPress={() => onCameraZoom(1.18)} />
      {mode === 'edit' && <RoundButton label="Reset editable placements" text="↺" onPress={onResetLayout} />}
    </View>
    <View style={styles.levelControl}>
      <RoundButton label="Move to parent segment layer" text="−" onPress={() => onLevel(level - 1)} disabled={level === 0} />
      <View style={styles.levelCopy}>
        <Text style={styles.levelTitle}>Layer {level}</Text>
        <Text style={styles.levelDetail}>{['parent corridors', 'child segments', 'milestones', 'node groups', 'atomic + evidence'][level]}</Text>
      </View>
      <RoundButton label="Move to child segment layer" text="+" onPress={() => onLevel(level + 1)} disabled={level === 4} />
    </View>
  </>
);

const RoundButton = ({ label, text, onPress, disabled }: { label: string; text: string; onPress: () => void; disabled?: boolean }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={[styles.roundButton, disabled && styles.disabled]}>
    <Text style={styles.roundText}>{text}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  modeControl: { position: 'absolute', left: 12, top: 10, flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: 'rgba(255,253,248,0.94)', shadowColor: mapTheme.shadow, shadowOpacity: 0.25, shadowRadius: 7 },
  modeButton: { minWidth: 58, height: 38, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  activeMode: { backgroundColor: mapTheme.forest },
  modeText: { color: mapTheme.muted, fontSize: 9, fontWeight: '800' },
  activeModeText: { color: mapTheme.paperStrong },
  cameraControl: { position: 'absolute', right: 12, top: 10, gap: 7 },
  roundButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(37,92,76,0.16)', backgroundColor: 'rgba(255,253,248,0.95)', shadowColor: mapTheme.shadow, shadowOpacity: 0.2, shadowRadius: 5 },
  roundText: { color: mapTheme.forest, fontSize: 19, fontWeight: '800' },
  disabled: { opacity: 0.35 },
  levelControl: { position: 'absolute', left: 12, right: 12, bottom: 14, minHeight: 52, paddingHorizontal: 4, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 18, backgroundColor: 'rgba(255,253,248,0.96)', shadowColor: mapTheme.shadow, shadowOpacity: 0.3, shadowRadius: 9 },
  levelCopy: { flex: 1, alignItems: 'center' },
  levelTitle: { color: mapTheme.forestDark, fontSize: 10, fontWeight: '900' },
  levelDetail: { marginTop: 2, color: mapTheme.muted, fontSize: 8, fontWeight: '600' },
});
