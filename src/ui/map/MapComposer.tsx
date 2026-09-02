import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Outcome, PlannedKind } from '../../domain/lifeMap/entities';
import { mapTheme, outcomeColor } from './mapTheme';

interface MapComposerProps {
  onSubmit: (value: { title: string; kind: Exclude<PlannedKind, 'originStatus'>; outcome: Outcome }) => void;
  onPreviewChange?: (value: { title: string; kind: Exclude<PlannedKind, 'originStatus'>; outcome: Outcome }) => void;
}

export const MapComposer = ({ onSubmit, onPreviewChange }: MapComposerProps) => {
  const [title, setTitle] = useState('New step');
  const [kind, setKind] = useState<Exclude<PlannedKind, 'originStatus'>>('task');
  const [outcome, setOutcome] = useState<Outcome>('todo');
  useEffect(() => {
    onPreviewChange?.({ title, kind, outcome });
  }, [title, kind, outcome, onPreviewChange]);
  return (
    <View>
      <Text style={styles.label}>Title</Text>
      <TextInput accessibilityLabel="New node title" value={title} onChangeText={setTitle} style={styles.input} />
      <Text style={styles.label}>Marker kind</Text>
      <View style={styles.chips}>
        {(['task', 'checkpoint', 'goal'] as const).map((candidate) => (
          <Chip key={candidate} active={kind === candidate} label={candidate === 'checkpoint' ? 'Status checkpoint' : candidate} onPress={() => setKind(candidate)} />
        ))}
      </View>
      <Text style={styles.label}>Outcome</Text>
      <View style={styles.chips}>
        {(['todo', 'success', 'failed'] as const).map((candidate) => (
          <Chip key={candidate} active={outcome === candidate} label={candidate} color={outcomeColor[candidate]} onPress={() => setOutcome(candidate)} />
        ))}
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Add planned point to the map" disabled={!title.trim()} onPress={() => onSubmit({ title: title.trim(), kind, outcome })} style={styles.submit}>
        <Text style={styles.submitText}>Add to the map</Text>
      </Pressable>
    </View>
  );
};

const Chip = ({ active, label, color, onPress }: { active: boolean; label: string; color?: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && { borderColor: color ?? mapTheme.forest, backgroundColor: mapTheme.sagePale }]}>
    <Text style={[styles.chipText, active && { color: color ?? mapTheme.forest }]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  label: { marginTop: 11, marginBottom: 5, color: mapTheme.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.8, textTransform: 'uppercase' },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(37,92,76,0.18)', color: mapTheme.ink, backgroundColor: mapTheme.paperStrong, fontSize: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: { minHeight: 38, paddingHorizontal: 11, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(37,92,76,0.14)' },
  chipText: { color: mapTheme.muted, fontSize: 9, fontWeight: '800', textTransform: 'capitalize' },
  submit: { marginTop: 16, minHeight: 48, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.forest },
  submitText: { color: mapTheme.paperStrong, fontSize: 11, fontWeight: '900' },
});
