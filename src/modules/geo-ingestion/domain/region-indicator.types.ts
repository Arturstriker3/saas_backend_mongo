/** One indicator value attached to a region for a reference. */
export interface RegionIndicatorInput {
  regionCode: string;
  /** Stable key of the indicator, e.g. `population`. */
  indicatorKey: string;
  /** Source vintage, e.g. the estimate year. */
  reference: string;
  value: number;
}
