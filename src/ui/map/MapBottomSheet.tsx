import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { PortraitMapProjection } from '../../application/map/projectionTypes';
import { Outcome, PlannedKind } from '../../domain/lifeMap/entities';
import { RuntimeNodeOption } from '../composition/createLifeMapRuntime';
import { MapComposer } from './MapComposer';
import { mapTheme, outcomeColor } from './mapTheme';
import { LifeMapSessionState } from './useLifeMapSession';

interface MapBottomSheetProps {
  session: LifeMapSessionState;
  projection: PortraitMapProjection;
  options: RuntimeNodeOption[];
  onClose: () => void;
  onFindRoad: (fromNodeId: string, toNodeId: string) => void;
  onToggleFilter: (outcome: Outcome) => void;
  onChangeOutcome: (nodeId: string, outcome: Outcome) => void;
  onEditNode: (nodeId: string, value: { title: string; description: string; kind: PlannedKind }) => void;
  onDelete: (type: 'node' | 'connection', id: string) => void;
  onInsert: (connectionId: string) => void;
  onBend: (connectionId: string, offsetX: number) => void;
  onAddRecord: (targetId: string, summary: string) => void;
  onOpenRecord: () => void;
  onCreate: (value: { title: string; kind: Exclude<PlannedKind, 'originStatus'>; outcome: Outcome }) => void;
  onConnect: (fromNodeId: string, toNodeId: string) => void;
  onArmDelete: (id: string) => void;
}

const nextOutcome: Record<Outcome, Outcome> = { success: 'todo', todo: 'failed', failed: 'success' };

export const MapBottomSheet = ({
  session,
  projection,
  options,
  onClose,
  onFindRoad,
  onToggleFilter,
  onChangeOutcome,
  onEditNode,
  onDelete,
  onInsert,
  onBend,
  onAddRecord,
  onOpenRecord,
  onCreate,
  onConnect,
  onArmDelete,
}: MapBottomSheetProps) => {
  const [query, setQuery] = useState('');
  const [routeFrom, setRouteFrom] = useState('start');
  const [recordText, setRecordText] = useState('');
  const selectedNode = session.selection?.type === 'node'
    ? projection.nodes.find((node) => node.id === session.selection?.id)
    : undefined;
  const [recordTarget, setRecordTarget] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editKind, setEditKind] = useState<PlannedKind>('task');

  useEffect(() => {
    if (selectedNode) {
      setEditTitle(selectedNode.title);
      setEditDescription(selectedNode.description);
      setEditKind(selectedNode.kind);
      if (selectedNode.kind === 'goal' || selectedNode.kind === 'task') setRecordTarget(selectedNode.id);
    }
  }, [selectedNode?.id]);

  const recordTargets = options.filter((option) => option.kind === 'goal' || option.kind === 'task');
  useEffect(() => {
    if (!recordTarget && recordTargets[0]) setRecordTarget(recordTargets[0].id);
  }, [recordTarget, recordTargets]);

  const routeTargets = useMemo(() => options.filter((option) =>
    option.id !== routeFrom && option.title.toLowerCase().includes(query.trim().toLowerCase()),
  ), [options, query, routeFrom]);
  if (!session.sheet) return null;

  const selectedConnection = session.selection?.type === 'connection'
    ? projection.connections.find((connection) => connection.id === session.selection?.id)
    : undefined;
  const selectedSummary = session.selection?.type === 'summary'
    ? projection.summaryConnections.find((connection) => connection.id === session.selection?.id)
    : undefined;
  const selectedSegment = session.selection?.type === 'segment'
    ? projection.segmentOverlays.find((segment) => segment.id === session.selection?.id)
    : undefined;
  const selectedRecord = session.selection?.type === 'record'
    ? projection.recordAttachments.find((record) => record.id === session.selection?.id)
    : undefined;

  const title = session.sheet === 'route' ? 'Find a road'
    : session.sheet === 'legend' ? 'Map legend'
      : session.sheet === 'record' ? 'Attach a Record'
        : session.sheet === 'composer' ? 'Add a planned point'
          : selectedNode?.title ?? selectedConnection?.meaning ?? selectedSummary?.meaning ?? selectedSegment?.title ?? selectedRecord?.summary ?? 'Map detail';

  return (
    <View style={styles.scrim} pointerEvents="box-none">
      <View accessibilityViewIsModal style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.sheetHeader}>
          <View style={styles.titleCopy}>
            <Text style={styles.kicker}>{session.sheet === 'detail' ? session.selection?.type : 'Life Map'}</Text>
            <Text style={styles.title}>{title}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close sheet" onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
          {session.sheet === 'route' && (
            <>
              <Text style={styles.label}>From</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {options.map((option) => <Chip key={option.id} active={routeFrom === option.id} label={option.title} onPress={() => setRouteFrom(option.id)} />)}
              </ScrollView>
              <Text style={styles.label}>To</Text>
              <TextInput accessibilityLabel="Search destination" value={query} onChangeText={setQuery} placeholder="Search a task, checkpoint, or goal" placeholderTextColor={mapTheme.faint} style={styles.input} />
              <View style={styles.results}>
                {routeTargets.map((option) => (
                  <Pressable key={option.id} accessibilityRole="button" onPress={() => onFindRoad(routeFrom, option.id)} style={styles.result}>
                    <View style={[styles.resultIcon, { borderColor: outcomeColor[option.outcome] }]}><Text style={{ color: outcomeColor[option.outcome] }}>›</Text></View>
                    <View style={styles.resultCopy}><Text style={styles.resultTitle}>{option.title}</Text><Text style={styles.resultMeta}>{option.depthRank} depth · {option.kind}</Text></View>
                    <Text style={styles.resultArrow}>›</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {session.sheet === 'legend' && (
            <>
              <Text style={styles.body}>Marker shape communicates kind. Fill and every incoming road communicate the endpoint outcome.</Text>
              <Text style={styles.label}>Outcome filters</Text>
              <View style={styles.chips}>
                {(['success', 'todo', 'failed'] as const).map((outcome) => (
                  <Chip key={outcome} active={session.filters.includes(outcome)} label={outcome} color={outcomeColor[outcome]} onPress={() => onToggleFilter(outcome)} />
                ))}
              </View>
              <View style={styles.legendGrid}>
                <LegendStat value="○" label="Goal" /><LegendStat value="›" label="Task" />
                <LegendStat value="◇" label="Status checkpoint" /><LegendStat value="▤" label="Record" />
                <LegendStat value={`L${session.semanticLevel}`} label="Hierarchy level" /><LegendStat value="⌁" label="Summary road" />
              </View>
            </>
          )}

          {session.sheet === 'record' && (
            <>
              <Text style={styles.label}>Related Goal or Task</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {recordTargets.map((option) => <Chip key={option.id} active={recordTarget === option.id} label={option.title} onPress={() => setRecordTarget(option.id)} />)}
              </ScrollView>
              <Text style={styles.label}>Short reflection</Text>
              <TextInput accessibilityLabel="Record reflection" multiline value={recordText} onChangeText={setRecordText} placeholder="What happened?" placeholderTextColor={mapTheme.faint} style={[styles.input, styles.textarea]} />
              <PrimaryButton label="Attach Record to the map" disabled={!recordText.trim() || !recordTarget} onPress={() => onAddRecord(recordTarget, recordText.trim())} />
            </>
          )}

          {session.sheet === 'composer' && <MapComposer onSubmit={onCreate} />}

          {session.sheet === 'detail' && selectedNode && (
            <>
              <Text style={styles.body}>{selectedNode.description || 'No description yet.'}</Text>
              <View style={styles.metadata}><Text style={styles.metaKey}>Kind</Text><Text style={styles.metaValue}>{selectedNode.kind === 'checkpoint' ? 'Status checkpoint' : selectedNode.kind}</Text><Text style={styles.metaKey}>Outcome</Text><Text style={[styles.metaValue, { color: outcomeColor[selectedNode.outcome] }]}>{selectedNode.outcome}</Text></View>
              <PrimaryButton label="Go to here" onPress={() => onFindRoad('start', selectedNode.id)} />
              {(selectedNode.kind === 'goal' || selectedNode.kind === 'task') && <SecondaryButton label="Add a Record" onPress={onOpenRecord} />}
              {session.mode === 'edit' && (
                <>
                  <Text style={styles.label}>Edit title</Text>
                  <TextInput accessibilityLabel="Edit node title" value={editTitle} onChangeText={setEditTitle} style={styles.input} />
                  <Text style={styles.label}>Kind</Text>
                  <View style={styles.chips}>
                    {selectedNode.kind === 'originStatus'
                      ? <Chip active label="Permanent Start" onPress={() => undefined} />
                      : (['task', 'checkpoint', 'goal'] as const).map((kind) => <Chip key={kind} active={editKind === kind} label={kind} onPress={() => setEditKind(kind)} />)}
                  </View>
                  <PrimaryButton label="Save node" onPress={() => onEditNode(selectedNode.id, { title: editTitle, description: editDescription, kind: editKind })} />
                  <SecondaryButton label={`Cycle outcome → ${nextOutcome[selectedNode.outcome]}`} onPress={() => onChangeOutcome(selectedNode.id, nextOutcome[selectedNode.outcome])} />
                  {selectedNode.kind !== 'originStatus' && (
                    <>
                      <Text style={styles.label}>Connect to a forward point</Text>
                      <View style={styles.chips}>
                        {options.filter((option) => option.depthRank > selectedNode.depthRank).slice(0, 6).map((option) => (
                          <Chip key={option.id} label={option.title} active={false} onPress={() => onConnect(selectedNode.id, option.id)} />
                        ))}
                      </View>
                      <DangerButton armed={session.deleteArmedId === selectedNode.id} onPress={() => session.deleteArmedId === selectedNode.id ? onDelete('node', selectedNode.id) : onArmDelete(selectedNode.id)} />
                    </>
                  )}
                </>
              )}
            </>
          )}

          {session.sheet === 'detail' && selectedConnection && (
            <>
              <Text style={styles.body}>{selectedConnection.meaning}</Text>
              <View style={styles.metadata}><Text style={styles.metaKey}>Endpoint outcome</Text><Text style={[styles.metaValue, { color: outcomeColor[selectedConnection.outcome] }]}>{selectedConnection.outcome}</Text></View>
              {session.mode === 'edit' && (
                <>
                  <PrimaryButton label="Insert a node into this connection" onPress={() => onInsert(selectedConnection.id)} />
                  <View style={styles.buttonRow}><SecondaryButton label="Bend left" onPress={() => onBend(selectedConnection.id, -24)} /><SecondaryButton label="Bend right" onPress={() => onBend(selectedConnection.id, 24)} /></View>
                  <DangerButton armed={session.deleteArmedId === selectedConnection.id} onPress={() => session.deleteArmedId === selectedConnection.id ? onDelete('connection', selectedConnection.id) : onArmDelete(selectedConnection.id)} />
                </>
              )}
            </>
          )}

          {session.sheet === 'detail' && selectedSummary && (
            <><Text style={styles.body}>{selectedSummary.hiddenCount} planned points and {selectedSummary.hiddenConnectionIds.length} canonical connections are summarized here.</Text><Text style={styles.label}>Select this road to descend one hierarchy level.</Text></>
          )}
          {session.sheet === 'detail' && selectedSegment && <><Text style={styles.body}>{selectedSegment.description}</Text><Text style={styles.label}>{selectedSegment.memberCount} members · hierarchy level {selectedSegment.hierarchyLevel}</Text></>}
          {session.sheet === 'detail' && selectedRecord && <><Text style={styles.body}>{selectedRecord.content ?? selectedRecord.summary}</Text><Text style={styles.label}>Exact target: {options.find((option) => option.id === selectedRecord.targetId)?.title}</Text></>}
        </ScrollView>
      </View>
    </View>
  );
};

const Chip = ({ active, label, color, onPress }: { active: boolean; label: string; color?: string; onPress: () => void }) => (
  <Pressable accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.chip, active && { borderColor: color ?? mapTheme.forest, backgroundColor: mapTheme.sagePale }]}>
    <Text numberOfLines={1} style={[styles.chipText, active && { color: color ?? mapTheme.forest }]}>{label}</Text>
  </Pressable>
);
const PrimaryButton = ({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) => <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.primary, disabled && { opacity: 0.4 }]}><Text style={styles.primaryText}>{label}</Text></Pressable>;
const SecondaryButton = ({ label, onPress }: { label: string; onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress} style={styles.secondary}><Text style={styles.secondaryText}>{label}</Text></Pressable>;
const DangerButton = ({ armed, onPress }: { armed: boolean; onPress: () => void }) => <Pressable accessibilityRole="button" onPress={onPress} style={[styles.secondary, armed && styles.danger]}><Text style={[styles.secondaryText, armed && styles.dangerText]}>{armed ? 'Tap again to confirm' : 'Delete / archive'}</Text></Pressable>;
const LegendStat = ({ value, label }: { value: string; label: string }) => <View style={styles.legendStat}><Text style={styles.legendValue}>{value}</Text><Text style={styles.legendLabel}>{label}</Text></View>;

const styles = StyleSheet.create({
  scrim: { ...StyleSheet.absoluteFillObject, justifyContent: 'flex-end', zIndex: 50, backgroundColor: 'rgba(23,63,53,0.12)' },
  sheet: { maxHeight: '62%', minHeight: 250, paddingTop: 7, borderTopLeftRadius: 25, borderTopRightRadius: 25, backgroundColor: mapTheme.paperStrong, shadowColor: '#000', shadowOpacity: 0.22, shadowRadius: 18 },
  handle: { alignSelf: 'center', width: 38, height: 4, borderRadius: 2, backgroundColor: 'rgba(37,92,76,0.2)' },
  sheetHeader: { minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center' },
  titleCopy: { flex: 1 },
  kicker: { color: mapTheme.gold, fontSize: 7, fontWeight: '900', letterSpacing: 1.2, textTransform: 'uppercase' },
  title: { marginTop: 2, color: mapTheme.forestDark, fontFamily: 'Georgia', fontSize: 18, fontWeight: '700' },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { color: mapTheme.forest, fontSize: 24 },
  content: { paddingHorizontal: 17, paddingBottom: 34 },
  body: { color: mapTheme.muted, fontSize: 11, lineHeight: 17 },
  label: { marginTop: 12, marginBottom: 6, color: mapTheme.faint, fontSize: 8, fontWeight: '900', letterSpacing: 0.7, textTransform: 'uppercase' },
  input: { minHeight: 44, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(37,92,76,0.16)', color: mapTheme.ink, backgroundColor: mapTheme.paper, fontSize: 11 },
  textarea: { minHeight: 84, paddingTop: 11, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', gap: 7 },
  chip: { maxWidth: 140, minHeight: 38, paddingHorizontal: 11, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(37,92,76,0.14)', alignItems: 'center', justifyContent: 'center' },
  chipText: { color: mapTheme.muted, fontSize: 9, fontWeight: '800' },
  results: { marginTop: 8, gap: 6 },
  result: { minHeight: 54, padding: 8, borderRadius: 14, flexDirection: 'row', alignItems: 'center', backgroundColor: mapTheme.paper },
  resultIcon: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  resultCopy: { flex: 1, marginLeft: 9 },
  resultTitle: { color: mapTheme.ink, fontSize: 10, fontWeight: '800' },
  resultMeta: { marginTop: 3, color: mapTheme.muted, fontSize: 8, fontWeight: '600' },
  resultArrow: { color: mapTheme.sage, fontSize: 19 },
  legendGrid: { marginTop: 14, flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  legendStat: { width: '47%', minHeight: 58, padding: 10, borderRadius: 13, backgroundColor: mapTheme.paper },
  legendValue: { color: mapTheme.forest, fontSize: 17, fontWeight: '900' },
  legendLabel: { marginTop: 4, color: mapTheme.muted, fontSize: 8, fontWeight: '700' },
  metadata: { marginTop: 11, padding: 11, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: mapTheme.paper },
  metaKey: { color: mapTheme.faint, fontSize: 8, fontWeight: '800', textTransform: 'uppercase' },
  metaValue: { color: mapTheme.forest, fontSize: 9, fontWeight: '900' },
  primary: { minHeight: 48, marginTop: 13, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: mapTheme.forest },
  primaryText: { color: mapTheme.paperStrong, fontSize: 10, fontWeight: '900' },
  secondary: { flex: 1, minHeight: 44, marginTop: 9, paddingHorizontal: 10, borderRadius: 13, borderWidth: 1, borderColor: 'rgba(37,92,76,0.18)', alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: mapTheme.forest, fontSize: 9, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  danger: { borderColor: mapTheme.failed, backgroundColor: mapTheme.failedPale },
  dangerText: { color: mapTheme.failed },
});
