"use client";

import { useState } from "react";
import { MARKET_EXPLORERS } from "./marketNeighborhoods";
import {
  PRODUCT_FEATURES,
  VALUATION_MARKET_IDS,
  VERIFIED_PARCEL_MARKET_IDS,
  marketLabel,
  type ProductFeatureId,
} from "./featureAvailability";

type Props = {
  onOpenMarket: (marketId: string, featureId: ProductFeatureId) => void;
};

export function FeatureAvailability({ onOpenMarket }: Props) {
  const [featureId, setFeatureId] = useState<ProductFeatureId>("screening");
  const feature = PRODUCT_FEATURES.find((item) => item.id === featureId) ?? PRODUCT_FEATURES[0];
  const [marketSelections, setMarketSelections] = useState<Record<ProductFeatureId, string>>(() => Object.fromEntries(
    PRODUCT_FEATURES.map((item) => [item.id, item.marketIds[0] ?? ""]),
  ) as Record<ProductFeatureId, string>);
  const selectedMarketId = feature.marketIds.includes(marketSelections[feature.id])
    ? marketSelections[feature.id]
    : feature.marketIds[0] ?? "";

  const parcelActivation = VERIFIED_PARCEL_MARKET_IDS.filter((id) => !VALUATION_MARKET_IDS.includes(id));
  const parcelAcquisition = MARKET_EXPLORERS.map((market) => market.id).filter((id) => !VERIFIED_PARCEL_MARKET_IDS.includes(id));

  function chooseFeature(id: ProductFeatureId) {
    setFeatureId(id);
  }

  return <section className="availability-section" id="availability">
    <div className="section-title"><div><p className="eyebrow">FEATURE AVAILABILITY · NO EMPTY MARKETS</p><h2>Pick the evidence.<br />Then pick the market.</h2></div><p>Every product surface now has its own data contract. The market menu below only includes regions with current, usable data for the selected feature; a national screening connection no longer implies parcel, safety, valuation or listing coverage.</p></div>
    <div className="availability-console">
      <div className="availability-controls">
        <label><span>Product feature</span><select value={feature.id} onChange={(event) => chooseFeature(event.target.value as ProductFeatureId)}>{PRODUCT_FEATURES.map((item) => <option key={item.id} value={item.id}>{item.label} · {item.marketIds.length}/20</option>)}</select></label>
        <label><span>Available market</span><select value={selectedMarketId} disabled={!feature.marketIds.length} onChange={(event) => setMarketSelections((current) => ({ ...current, [feature.id]: event.target.value }))}>{feature.marketIds.length ? feature.marketIds.map((id) => <option key={id} value={id}>{marketLabel(id)}</option>) : <option value="">No licensed markets yet</option>}</select></label>
        <button disabled={!selectedMarketId} onClick={() => onOpenMarket(selectedMarketId, feature.id)}>Open available data →</button>
      </div>
      <article className="availability-readout">
        <div><span>Current coverage</span><strong>{feature.marketIds.length}<i>/20</i></strong><small>{Math.round(feature.marketIds.length / MARKET_EXPLORERS.length * 100)}% of expansion markets</small></div>
        <div><span>{feature.freshness}</span><h3>{feature.shortLabel}</h3><p>{feature.description}</p><b>{feature.boundary}</b></div>
      </article>
      <div className="availability-market-list" aria-label={`${feature.label} available markets`}>
        {feature.marketIds.length ? feature.marketIds.map((id) => <button key={id} className={selectedMarketId === id ? "active" : ""} onClick={() => setMarketSelections((current) => ({ ...current, [feature.id]: id }))}>{marketLabel(id)}</button>) : <p><b>Explicit gap:</b> active listing markets remain hidden until an MLS or licensed aggregator grants the required analytics and display rights.</p>}
      </div>
    </div>
    <div className="expansion-sequence">
      <article className="current"><span>01 · DEEPEN NOW</span><strong>{VALUATION_MARKET_IDS.length} markets</strong><h3>Validate listing + ATTOM joins</h3><p>{VALUATION_MARKET_IDS.map(marketLabel).join(" · ")}</p><small>Track ATTOM match, entitlement, freshness and disagreement by market; join asking price, status and DOM to the existing validated property models.</small></article>
      <article><span>02 · ACTIVATE NEXT</span><strong>{parcelActivation.length} markets</strong><h3>Promote verified parcels</h3><p>{parcelActivation.map(marketLabel).join(" · ")}</p><small>Add qualified sales, model backtests and jurisdiction joins. A market moves to valuation only after the historical error gate passes.</small></article>
      <article><span>03 · CONNECT AFTER</span><strong>{parcelAcquisition.length} markets</strong><h3>Acquire local parcel truth</h3><p>{parcelAcquisition.map(marketLabel).join(" · ")}</p><small>Verify one reusable city, county or state source per market before exposing parcel or property controls.</small></article>
    </div>
  </section>;
}
