// A typed reader over one sport's published root. Paths always come from the explorer index or a
// document's own links/paths (research graph §1: "it never guesses a path"); the only fixed names
// are the contract's file names.
import type {
  BoardDoc,
  CapabilityManifestDoc,
  EntityProfileDoc,
  EventDetailDoc,
  EventDoc,
  EventResearchDoc,
  ExplorerIndexDoc,
  HealthDoc,
  ItemsDoc,
  ManifestDoc,
  MarketHistoryDoc,
  MetricDef,
  MetricRegistryDoc,
  RankingDoc,
  Recommendation,
  SearchIndexDoc,
  SeriesDoc,
  Thesis,
} from '../contract/types';
import { getJson, joinUrl, NotFoundError } from './fetcher';
import type { SportSource } from './source';

const fileTables = new WeakMap<ExplorerIndexDoc, Map<string, string>>();

export class SportRepo {
  constructor(public source: SportSource) {}

  get sport() {
    return this.source.sport;
  }

  get hasExplorer(): boolean {
    return this.source.mode === 'live' || this.source.mode === 'snapshot';
  }

  url(path: string): string {
    if (!this.source.root) throw new NotFoundError(path);
    return joinUrl(this.source.root, path);
  }

  doc<T>(path: string): Promise<T> {
    return getJson<T>(this.url(path));
  }

  // ---- v1
  health = () => this.doc<HealthDoc>('health.json');
  manifest = () => this.doc<ManifestDoc>('manifest.json');
  board = () => this.doc<BoardDoc>('board.json');
  events = () => this.doc<ItemsDoc<EventDoc>>('events.json');
  theses = () => this.doc<ItemsDoc<Thesis>>('theses.json');
  recommendations = () => this.doc<ItemsDoc<Recommendation>>('recommendations.json');

  async eventDetail(eventId: string): Promise<EventDetailDoc> {
    const board = await this.board();
    const row = board.items.find((r) => r.event_id === eventId);
    if (!row) throw new NotFoundError(`event_detail for ${eventId}`);
    return this.doc<EventDetailDoc>(row.detail_path);
  }

  // ---- explorer
  index = () => this.doc<ExplorerIndexDoc>('explorer/index.json');

  async capabilities(): Promise<CapabilityManifestDoc> {
    const idx = await this.index();
    return this.doc<CapabilityManifestDoc>(idx.capabilities_path);
  }

  async metrics(): Promise<MetricRegistryDoc> {
    const idx = await this.index();
    return this.doc<MetricRegistryDoc>(idx.metrics_path);
  }

  async metricMap(): Promise<Map<string, MetricDef>> {
    const reg = await this.metrics();
    return new Map(reg.items.map((m) => [m.metric_id, m]));
  }

  async searchIndex(): Promise<SearchIndexDoc> {
    const idx = await this.index();
    return this.doc<SearchIndexDoc>(idx.search_index_path);
  }

  /** explorer-relative path ("teams/prt_x.json") -> app-root path, by entity id and kind. */
  async pathFor(entityId: string, kind: string): Promise<string | null> {
    const idx = await this.index();
    let table = fileTables.get(idx);
    if (!table) {
      table = new Map();
      for (const [rel, f] of Object.entries(idx.files)) {
        if (f.entity_id) table.set(`${f.kind}:${f.entity_id}`, `explorer/${rel}`);
      }
      fileTables.set(idx, table);
    }
    return table.get(`${kind}:${entityId}`) ?? null;
  }

  private async byId<T>(entityId: string, kind: string): Promise<T> {
    const p = await this.pathFor(entityId, kind);
    if (!p) throw new NotFoundError(`${kind} ${entityId}`);
    return this.doc<T>(p);
  }

  profile = (participantId: string) => this.byId<EntityProfileDoc>(participantId, 'entity_profile');
  eventResearch = (eventId: string) => this.byId<EventResearchDoc>(eventId, 'event_research');
  ranking = (rankingId: string) => this.byId<RankingDoc>(rankingId, 'ranking');
  series = (seriesId: string) => this.byId<SeriesDoc>(seriesId, 'time_series');
  marketHistory = (eventId: string) => this.byId<MarketHistoryDoc>(eventId, 'market_history');

  async hasDoc(entityId: string, kind: string): Promise<boolean> {
    return (await this.pathFor(entityId, kind)) != null;
  }
}
