import { RecordEntry } from '../../domain/lifeMap/entities';
import { LifeMap } from '../../domain/lifeMap/LifeMap';
import { invariant } from '../../domain/lifeMap/LifeMapErrors';
import { LifeMapRepository } from '../../domain/lifeMap/repository/LifeMapRepository';
import { MapLayoutRepository } from '../../domain/lifeMap/repository/MapLayoutRepository';
import { RoadLayoutService } from '../map/RoadLayoutService';

export interface CaptureRecordCommand extends RecordEntry {}

export class CaptureRecord {
  private readonly layoutService = new RoadLayoutService();

  constructor(
    private readonly lifeMaps: LifeMapRepository,
    private readonly layouts: MapLayoutRepository,
  ) {}

  async execute(command: CaptureRecordCommand): Promise<void> {
    invariant(command.summary.trim(), 'invalid-operation', 'A short reflection is required');
    invariant(!Number.isNaN(Date.parse(command.occurredAt)), 'invalid-operation', 'Record time must be an ISO date');
    const [snapshot, layout] = await Promise.all([this.lifeMaps.load(), this.layouts.load()]);
    const next = LifeMap.create(snapshot).captureRecord({
      ...command,
      summary: command.summary.trim(),
      content: command.content?.trim(),
    }).snapshot();
    const targetPlacement = layout.placements.find((placement) => placement.nodeId === command.targetId);
    invariant(targetPlacement, 'missing-reference', 'The Record target has no placement');
    const targetY = this.layoutService.worldY(targetPlacement);
    const recordX = targetPlacement.worldX + (snapshot.records.filter((record) => record.targetId === command.targetId).length % 2 ? 34 : -34);
    const nextLayout = this.layoutService.withMovedRecord(layout, command.id, recordX, targetY + 32);
    await this.layouts.save(nextLayout, layout.version);
    try {
      await this.lifeMaps.save(next, snapshot.version);
    } catch (error) {
      try {
        await this.layouts.save({ ...layout, version: nextLayout.version + 1 }, nextLayout.version);
      } catch {
        // Preserve a concurrent layout update over a failed best-effort rollback.
      }
      throw error;
    }
  }
}
