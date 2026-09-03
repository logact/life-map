import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { Circle, G, Path } from 'react-native-svg';
import { ScreenPoint } from '../../application/map/projectionTypes';
import { Outcome } from '../../domain/lifeMap/entities';
import { arrowheadPath, quadraticPath } from './mapGeometry';
import { mapTheme, outcomeColor } from './mapTheme';

export const MARKER_RADIUS: Record<string, number> = {
  status: 21,
  goal: 22,
  task: 19,
};

/** Red blocked badge (circle + white X) at a failed road's curve midpoint. */
export const BlockerBadge = ({ point, muted, testID }: { point: ScreenPoint; muted: boolean; testID?: string }) => (
  <G testID={testID} opacity={muted ? 0.11 : 1} x={point.x} y={point.y}>
    <Circle r={7} fill={mapTheme.failed} />
    <Path d="M -2.5 -2.5 L 2.5 2.5 M 2.5 -2.5 L -2.5 2.5" stroke={mapTheme.paperStrong} strokeWidth={1.6} strokeLinecap="round" />
  </G>
);

/** Per-outcome arrowhead: solid for success/failed, hollow for todo (matching the dashed road). */
export const RoadArrowhead = ({
  from,
  control,
  to,
  outcome,
  opacity,
  tipInset = 20,
  testID,
}: {
  from: ScreenPoint;
  control: ScreenPoint;
  to: ScreenPoint;
  outcome: Outcome;
  opacity: number;
  tipInset?: number;
  testID?: string;
}) => (
  <Path
    testID={testID}
    d={arrowheadPath(from, control, to, 9, tipInset)}
    fill={outcome === 'todo' ? mapTheme.paperStrong : outcomeColor[outcome]}
    stroke={outcome === 'todo' ? outcomeColor.todo : 'none'}
    strokeWidth={outcome === 'todo' ? 1.4 : 0}
    opacity={opacity}
  />
);

const AnimatedPath = Animated.createAnimatedComponent(Path);

/**
 * Dashed preview/spark road. The dash offset flows while animations are
 * allowed and stays static under reduced motion.
 */
export const FlowPath = ({
  from,
  control,
  to,
  color,
  width = 2.4,
  reducedMotion,
  testID,
}: {
  from: ScreenPoint;
  control: ScreenPoint;
  to: ScreenPoint;
  color: string;
  width?: number;
  reducedMotion: boolean;
  testID?: string;
}) => {
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(
      Animated.timing(offset, { toValue: -26, duration: 700, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [offset, reducedMotion]);
  return (
    <AnimatedPath
      testID={testID}
      d={quadraticPath(from, control, to)}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={[8, 6]}
      strokeDashoffset={reducedMotion ? 0 : offset}
    />
  );
};

/** Animated ring shown at the press point while a blank long-press is held. */
export const HoldRing = ({ point, reducedMotion, testID }: { point: ScreenPoint; reducedMotion: boolean; testID?: string }) => {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) {
      progress.setValue(1);
      return;
    }
    Animated.timing(progress, { toValue: 1, duration: 560, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [progress, reducedMotion]);
  return (
    <View pointerEvents="none" style={[ringStyles.anchor, { left: point.x, top: point.y }]}>
      <Animated.View
        testID={testID}
        style={[ringStyles.ring, {
          opacity: progress.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.25] }),
          transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.15] }) }],
        }]}
      />
    </View>
  );
};

/** White spark dashes that travel along a road after it was created or edited. */
export const SparkPath = ({ from, control, to, reducedMotion, testID }: {
  from: ScreenPoint;
  control: ScreenPoint;
  to: ScreenPoint;
  reducedMotion: boolean;
  testID?: string;
}) => {
  const offset = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(
      Animated.timing(offset, { toValue: -18, duration: 900, easing: Easing.linear, useNativeDriver: false }),
    );
    loop.start();
    return () => loop.stop();
  }, [offset, reducedMotion]);
  return (
    <AnimatedPath
      testID={testID}
      d={quadraticPath(from, control, to)}
      fill="none"
      stroke="rgba(255,253,248,0.98)"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeDasharray={[1, 17]}
      strokeDashoffset={reducedMotion ? 0 : offset}
    />
  );
};

/** Pulsing ring behind the selected marker; static when reduced motion is on. */
export const SelectionRing = ({ radius, reducedMotion, color = mapTheme.gold, testID = 'selection-ring' }: {
  radius: number;
  reducedMotion: boolean;
  color?: string;
  testID?: string;
}) => {
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reducedMotion) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 720, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reducedMotion]);
  const size = radius * 2 + 12;
  return (
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[ringStyles.selection, {
        width: size,
        height: size,
        borderRadius: size / 2,
        borderColor: color,
        opacity: reducedMotion ? 0.75 : pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 0.3] }),
        transform: [{ scale: reducedMotion ? 1 : pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) }],
      }]}
    />
  );
};

const ringStyles = StyleSheet.create({
  anchor: { position: 'absolute', width: 0, height: 0, zIndex: 9 },
  ring: { position: 'absolute', left: -24, top: -24, width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: mapTheme.gold, backgroundColor: 'rgba(208,146,52,0.12)' },
  selection: { position: 'absolute', borderWidth: 2.5, borderColor: mapTheme.gold },
});
