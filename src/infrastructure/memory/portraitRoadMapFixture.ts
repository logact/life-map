import {
  Connection,
  LifeMapSnapshot,
  MapLayoutSnapshot,
  Outcome,
  PlannedKind,
  PlannedNode,
  RoadSegment,
} from '../../domain/lifeMap/entities';
import { LifeMap } from '../../domain/lifeMap/LifeMap';

type FixtureNode = [
  id: string,
  kind: PlannedKind,
  title: string,
  x: number,
  rank: number,
  outcome: Outcome,
  description: string,
];

const nodeData: FixtureNode[] = [
  ['start', 'originStatus', 'Started here', 195, 0, 'success', 'The permanent origin of this journey.'],
  ['choose', 'task', 'Choose a focus', 45, 1, 'success', 'Name the area that matters most before moving forward.'],
  ['plan-home', 'task', 'Make family time', 195, 1, 'success', 'Reserve dependable time for the people who matter most.'],
  ['explore-kyoto', 'task', 'Explore Kyoto move', 345, 1, 'todo', 'An isolated idea waiting to be connected to a road.'],
  ['health-route', 'task', 'Build consistency', 55, 2, 'success', 'Create a repeatable weekly health rhythm.'],
  ['family-route', 'checkpoint', 'Calendar aligned', 195, 2, 'success', 'Shared family time is now protected.'],
  ['work-route', 'task', 'Shape my practice', 335, 2, 'success', 'Turn creative work into a deliberate practice.'],
  ['base-mileage', 'task', 'Build weekly base', 55, 3, 'success', 'Increase weekly distance sustainably.'],
  ['run', 'task', 'Run three times', 35, 4, 'success', 'Complete three comfortable runs each week.'],
  ['sleep', 'task', 'Protect sleep', 115, 4, 'todo', 'Keep a consistent wind-down and bedtime.'],
  ['weekly-dinner', 'task', 'Weekly dinner', 195, 4, 'failed', 'Share one unhurried meal together every week.'],
  ['portfolio', 'task', 'Publish a case study', 275, 4, 'success', 'Show the thinking behind one meaningful project.'],
  ['interviews', 'task', 'Talk to designers', 355, 4, 'failed', 'Learn from three designers doing work I admire.'],
  ['ten-k-checkpoint', 'checkpoint', '10K checkpoint', 55, 5, 'failed', 'A checkpoint confirming whether the endurance base works.'],
  ['half-marathon-plan', 'task', 'Prepare for 21K', 55, 6, 'todo', 'Build safely toward half-marathon distance.'],
  ['health', 'goal', 'Healthy rhythm', 55, 7, 'todo', 'A stable rhythm where energy and movement feel natural.'],
  ['connected-home', 'goal', 'Connected home', 195, 7, 'todo', 'A home rhythm with space for shared experiences.'],
  ['work', 'goal', 'Trusted designer', 335, 7, 'todo', 'Become known for thoughtful work and dependable craft.'],
  ['marathon', 'goal', 'Finish a marathon', 35, 8, 'todo', 'The destination at the top of a deep training road.'],
  ['family-trip', 'goal', 'Take a family trip', 141.667, 8, 'todo', 'A landmark made possible by a stronger shared rhythm.'],
  ['studio', 'goal', 'Lead a small studio', 248.333, 8, 'todo', 'The destination at the top of the creative work road.'],
  ['move-kyoto', 'goal', 'Live in Kyoto', 355, 8, 'todo', 'An isolated landmark that can be connected later.'],
];

const nodes: PlannedNode[] = nodeData.map(([id, kind, title, , , outcome, description]) => ({
  id,
  kind,
  title,
  description,
  outcome,
}));

type FixtureConnection = [id: string, from: string, to: string, meaning: string];
const connectionData: FixtureConnection[] = [
  ['r1', 'start', 'choose', 'begins with'],
  ['r2', 'choose', 'health-route', 'opens health road'],
  ['r3', 'choose', 'work-route', 'opens work road'],
  ['r4', 'health-route', 'base-mileage', 'starts with a durable base'],
  ['r5', 'base-mileage', 'run', 'becomes a weekly practice'],
  ['r6', 'work-route', 'portfolio', 'implemented by'],
  ['r7', 'work-route', 'interviews', 'waiting on replies'],
  ['r8', 'run', 'ten-k-checkpoint', 'builds toward the first distance checkpoint'],
  ['r9', 'sleep', 'ten-k-checkpoint', 'recovery routine disrupted'],
  ['r10', 'portfolio', 'work', 'demonstrates craft'],
  ['r11', 'interviews', 'work', 'builds perspective'],
  ['r12', 'health', 'marathon', 'continues toward'],
  ['r13', 'work', 'studio', 'continues toward'],
  ['r14', 'start', 'plan-home', 'begins the family road'],
  ['r15', 'plan-home', 'family-route', 'protects time together'],
  ['r16', 'family-route', 'weekly-dinner', 'travel schedules conflict'],
  ['r17', 'weekly-dinner', 'connected-home', 'builds connection'],
  ['r18', 'connected-home', 'family-trip', 'makes the trip possible'],
  ['r19', 'sleep', 'connected-home', 'creates more shared energy'],
  ['r20', 'weekly-dinner', 'work', 'needs a sustainable schedule'],
  ['r21', 'base-mileage', 'sleep', 'requires dependable recovery'],
  ['r22', 'ten-k-checkpoint', 'half-marathon-plan', 'unlocks the longer training block'],
  ['r23', 'half-marathon-plan', 'health', 'establishes endurance as a healthy rhythm'],
];

const connections: Connection[] = connectionData.map(([id, fromNodeId, toNodeId, meaning]) => ({
  id,
  fromNodeId,
  toNodeId,
  meaning,
}));

const segment = (
  id: string,
  roadId: string | undefined,
  title: string,
  parentSegmentId: string | undefined,
  memberNodeIds: string[],
  connectionIds: string[],
  tone?: RoadSegment['tone'],
): RoadSegment => ({
  id,
  roadId,
  title,
  parentSegmentId,
  memberNodeIds,
  connectionIds,
  tone,
  description: `${title} segment`,
});

const rootAndChildSegments: RoadSegment[] = [
  segment('marathon-journey', 'marathon-road', 'Marathon journey', undefined,
    ['start', 'choose', 'health-route', 'base-mileage', 'run', 'sleep', 'ten-k-checkpoint', 'half-marathon-plan', 'health', 'marathon'],
    ['r1', 'r2', 'r4', 'r5', 'r21', 'r8', 'r9', 'r22', 'r23', 'r12']),
  segment('marathon-direction', 'marathon-road', 'Direction', 'marathon-journey', ['start', 'choose', 'health-route'], ['r1', 'r2'], 'foundation'),
  segment('marathon-foundation', 'marathon-road', 'Foundation', 'marathon-journey', ['health-route', 'base-mileage', 'run', 'sleep', 'ten-k-checkpoint'], ['r4', 'r5', 'r21', 'r8', 'r9'], 'foundation'),
  segment('marathon-distance', 'marathon-road', 'Distance', 'marathon-journey', ['ten-k-checkpoint', 'half-marathon-plan', 'health'], ['r22', 'r23'], 'distance'),
  segment('marathon-readiness', 'marathon-road', 'Readiness', 'marathon-journey', ['health', 'marathon'], ['r12'], 'readiness'),
  segment('family-journey', 'family-road', 'Family journey', undefined, ['start', 'plan-home', 'family-route', 'weekly-dinner', 'connected-home', 'family-trip'], ['r14', 'r15', 'r16', 'r17', 'r18']),
  segment('family-direction', 'family-road', 'Direction', 'family-journey', ['start', 'plan-home', 'family-route'], ['r14', 'r15'], 'foundation'),
  segment('family-practice', 'family-road', 'Shared practice', 'family-journey', ['family-route', 'weekly-dinner', 'connected-home'], ['r16', 'r17'], 'distance'),
  segment('family-landmark', 'family-road', 'Landmark', 'family-journey', ['connected-home', 'family-trip'], ['r18'], 'readiness'),
  segment('studio-journey', 'studio-road', 'Studio journey', undefined, ['start', 'choose', 'work-route', 'portfolio', 'interviews', 'work', 'studio'], ['r1', 'r3', 'r6', 'r7', 'r10', 'r11', 'r13']),
  segment('studio-direction', 'studio-road', 'Direction', 'studio-journey', ['start', 'choose', 'work-route'], ['r1', 'r3'], 'foundation'),
  segment('studio-practice', 'studio-road', 'Craft practice', 'studio-journey', ['work-route', 'portfolio', 'interviews', 'work'], ['r6', 'r7', 'r10', 'r11'], 'distance'),
  segment('studio-landmark', 'studio-road', 'Landmark', 'studio-journey', ['work', 'studio'], ['r13'], 'readiness'),
];

const leaves: RoadSegment[] = [
  segment('marathon-intent', 'marathon-road', 'Choose intent', 'marathon-direction', ['start', 'choose'], ['r1'], 'foundation'),
  segment('marathon-entry', 'marathon-road', 'Enter health road', 'marathon-direction', ['choose', 'health-route'], ['r2'], 'foundation'),
  segment('marathon-weekly-base', 'marathon-road', 'Weekly base', 'marathon-foundation', ['health-route', 'base-mileage', 'run', 'sleep'], ['r4', 'r5', 'r21'], 'foundation'),
  segment('marathon-10k-gate', 'marathon-road', 'Reach 10K', 'marathon-foundation', ['run', 'sleep', 'ten-k-checkpoint'], ['r8', 'r9'], 'distance'),
  segment('marathon-21k-build', 'marathon-road', 'Build to 21K', 'marathon-distance', ['ten-k-checkpoint', 'half-marathon-plan', 'health'], ['r22', 'r23'], 'distance'),
  segment('marathon-finish-line', 'marathon-road', 'Finish line', 'marathon-readiness', ['health', 'marathon'], ['r12'], 'readiness'),
  segment('family-time-entry', 'family-road', 'Protect time', 'family-direction', ['start', 'plan-home', 'family-route'], ['r14', 'r15'], 'foundation'),
  segment('family-weekly-ritual', 'family-road', 'Weekly ritual', 'family-practice', ['family-route', 'weekly-dinner', 'connected-home'], ['r16', 'r17'], 'distance'),
  segment('family-trip-finish', 'family-road', 'Reach trip', 'family-landmark', ['connected-home', 'family-trip'], ['r18'], 'readiness'),
  segment('studio-entry', 'studio-road', 'Enter practice', 'studio-direction', ['start', 'choose', 'work-route'], ['r1', 'r3'], 'foundation'),
  segment('studio-proof', 'studio-road', 'Publish proof', 'studio-practice', ['work-route', 'portfolio', 'work'], ['r6', 'r10'], 'distance'),
  segment('studio-conversations', 'studio-road', 'Learn from peers', 'studio-practice', ['work-route', 'interviews', 'work'], ['r7', 'r11'], 'distance'),
  segment('studio-finish', 'studio-road', 'Lead studio', 'studio-landmark', ['work', 'studio'], ['r13'], 'readiness'),
];

const deepSegments = leaves.flatMap((leaf): RoadSegment[] => {
  const groupId = `${leaf.id}-node-group`;
  return [
    segment(groupId, leaf.roadId, `${leaf.title} detail`, leaf.id, [...leaf.memberNodeIds], [...leaf.connectionIds], leaf.tone),
    ...leaf.connectionIds.map((connectionId) => {
      const connection = connections.find((candidate) => candidate.id === connectionId)!;
      return segment(
        `${leaf.id}-atomic-${connectionId}`,
        leaf.roadId,
        `To ${nodes.find((node) => node.id === connection.toNodeId)?.title ?? connection.toNodeId}`,
        groupId,
        [connection.fromNodeId, connection.toNodeId],
        [connectionId],
        leaf.tone,
      );
    }),
  ];
});

const standaloneSegments = [
  segment('health-family-bridge', undefined, 'Health → family bridge', undefined, ['sleep', 'connected-home'], ['r19']),
  segment('family-studio-bridge', undefined, 'Family → studio bridge', undefined, ['weekly-dinner', 'work'], ['r20']),
];

const records = [
  ['record-run', 'run', '20 min run', 'Ran for 20 minutes. Breathing felt easier than last week.'],
  ['record-sleep', 'sleep', '7h 40m', 'Slept 7h 40m and woke before the alarm.'],
  ['record-dinner', 'weekly-dinner', 'Phones away', 'Everyone put their phones away and stayed longer.'],
  ['record-work', 'portfolio', 'First draft', 'Finished the first narrative draft.'],
  ['record-interviews', 'interviews', '2 replies', 'Two designers replied and one conversation is booked.'],
  ['record-base', 'base-mileage', '28 km week', 'Completed a comfortable 28 km training week.'],
  ['record-half', 'half-marathon-plan', 'First 18K', 'Completed the first 18 km long run.'],
  ['record-goal', 'health', 'Energy +', 'Energy has been more stable for two weeks.'],
  ['record-home', 'connected-home', 'Sunday walk', 'Took a long Sunday walk together.'],
  ['record-marathon', 'marathon', 'Registered', 'Registered for the autumn marathon.'],
  ['record-studio', 'studio', 'Referral', 'A past client referred the studio to a new team.'],
].map(([id, targetId, summary, content]) => ({ id, targetId, summary, content, occurredAt: '2026-08-24T08:00:00.000Z' }));

const snapshot: LifeMapSnapshot = {
  version: 1,
  nodes,
  connections,
  roads: [
    { id: 'marathon-road', title: 'Marathon road', description: 'A deep training road.', destinationGoalId: 'marathon', rootSegmentId: 'marathon-journey', featured: true },
    { id: 'family-road', title: 'Family road', description: 'A shared-practice road.', destinationGoalId: 'family-trip', rootSegmentId: 'family-journey' },
    { id: 'studio-road', title: 'Studio road', description: 'A creative-practice road.', destinationGoalId: 'studio', rootSegmentId: 'studio-journey' },
  ],
  segments: [...rootAndChildSegments, ...leaves, ...deepSegments, ...standaloneSegments],
  records,
};

const recordPositions: Record<string, [number, number]> = {
  'record-run': [12, 394], 'record-sleep': [105, 397], 'record-dinner': [191, 397],
  'record-work': [252, 394], 'record-interviews': [366, 396], 'record-base': [78, 457],
  'record-half': [82, 244], 'record-goal': [78, 174], 'record-home': [198, 178],
  'record-marathon': [20, 108], 'record-studio': [268, 108],
};

const layout: MapLayoutSnapshot = {
  version: 1,
  placements: nodeData.map(([nodeId, , , worldX, depthRank]) => ({ nodeId, worldX, depthRank })),
  recordPlacements: records.map((record) => ({
    recordId: record.id,
    worldX: recordPositions[record.id][0],
    worldY: recordPositions[record.id][1],
  })),
  bends: [],
};

export const createPortraitRoadMapSnapshot = (): LifeMapSnapshot => LifeMap.create(snapshot).snapshot();
export const createPortraitRoadMapLayout = (): MapLayoutSnapshot => ({
  ...layout,
  placements: layout.placements.map((placement) => ({ ...placement })),
  recordPlacements: layout.recordPlacements.map((placement) => ({ ...placement })),
  bends: [],
});
