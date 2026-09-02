import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HeaderSummary } from '../../application/map/projectionTypes';
import { mapTheme } from './mapTheme';

interface MapHeaderProps {
  summary: HeaderSummary;
  onRoute: () => void;
  onReset: () => void;
  onLegend: () => void;
  onClearRoute: () => void;
}

export const MapHeader = ({ summary, onRoute, onReset, onLegend, onClearRoute }: MapHeaderProps) => (
  <View style={styles.header}>
    <View style={styles.identityRow}>
      <View style={styles.identity}>
        <Text style={styles.eyebrow}>LIFE MAP</Text>
        <Text style={styles.title}>The roads ahead</Text>
      </View>
      <View style={styles.actions}>
        <HeaderButton label="Find a road" glyph="⌁" onPress={onRoute} />
        <HeaderButton label="Reset camera" glyph="↺" onPress={onReset} />
        <HeaderButton label="Legend and filters" glyph="◫" onPress={onLegend} />
      </View>
    </View>
    <View style={[styles.summary, summary.activeRoute && styles.routeSummary]}>
      <View style={styles.summaryCopy}>
        <Text numberOfLines={1} style={[styles.summaryTitle, summary.activeRoute && styles.routeText]}>{summary.title}</Text>
        <Text style={[styles.summaryDetail, summary.activeRoute && styles.routeDetail]}>{summary.detail}</Text>
      </View>
      {summary.activeRoute && (
        <Pressable accessibilityRole="button" accessibilityLabel="Clear shown road" onPress={onClearRoute} style={styles.clearButton}>
          <Text style={styles.clearText}>×</Text>
        </Pressable>
      )}
    </View>
  </View>
);

const HeaderButton = ({ label, glyph, onPress }: { label: string; glyph: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={styles.headerButton}>
    <Text style={styles.headerGlyph}>{glyph}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 9, backgroundColor: mapTheme.paperStrong, borderBottomColor: 'rgba(37,92,76,0.12)', borderBottomWidth: StyleSheet.hairlineWidth, zIndex: 20 },
  identityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  identity: { flex: 1 },
  eyebrow: { color: mapTheme.gold, fontSize: 8, fontWeight: '900', letterSpacing: 2 },
  title: { marginTop: 1, color: mapTheme.forestDark, fontFamily: 'Georgia', fontSize: 20, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 7 },
  headerButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(37,92,76,0.14)', backgroundColor: mapTheme.paper },
  headerGlyph: { color: mapTheme.forest, fontSize: 19, fontWeight: '800' },
  summary: { marginTop: 7, minHeight: 32, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 12, flexDirection: 'row', alignItems: 'center', backgroundColor: mapTheme.sagePale },
  routeSummary: { backgroundColor: mapTheme.forest },
  summaryCopy: { flex: 1 },
  summaryTitle: { color: mapTheme.forestDark, fontSize: 10, fontWeight: '800' },
  summaryDetail: { marginTop: 2, color: mapTheme.muted, fontSize: 8, fontWeight: '700' },
  clearButton: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center' },
  clearText: { color: mapTheme.paperStrong, fontSize: 20 },
  routeText: { color: mapTheme.paperStrong },
  routeDetail: { color: 'rgba(255,253,248,0.7)' },
});
