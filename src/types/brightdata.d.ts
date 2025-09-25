export interface SearchInput {
  keyword: string;
  location: string;
  country: string;
}

export interface TriggerResponse {
  snapshot_id?: string;
  snapshot?: string;
  id?: string;
  snapshotId?: string;
}
