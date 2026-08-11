# BORO model and data-quality review

**Audience:** CTO and product/model-risk leadership  
**Review date:** 2026-08-11  
**Reviewed release:** Public-record valuation model v3.1 plus live ATTOM and RentCast adapters

## Executive decision

BORO is ready to be described as an **evidence-first market and property screening product**. It is not yet a nationally calibrated future-value model, appraisal system or investment recommender.

The current transparent hybrid model remains the production champion because the available training history is too shallow and inconsistent for a deep model to be trusted across markets. The immediate technical advantage comes from better validation, uncertainty calibration, evidence separation and regional gates—not from adding neural-network complexity.

Current property-model disposition:

| Market | Gate | Rolling tests | Median error | P80 error | Median bias | PRD | CTO disposition |
|---|---:|---:|---:|---:|---:|---:|---|
| Raleigh | Pass | 1,175 | 10.7% | 21.5% | -0.1% | 1.048 | Usable for screening with the published interval and verified deal inputs |
| Chicago | Watch | 13 | 10.7% | 20.4% | +6.2% | 1.008 | Error is promising, but the test sample is too small for equal-confidence comparison |
| Philadelphia | Compromised | 578 | 34.4% | 62.0% | -3.3% | 1.205 | Bias and price-level distortion improved, but property decisions remain blocked while condition/renovation evidence is missing |

The Philadelphia result is not a cosmetic warning. Version 3.1 improves PRD from 1.263 to 1.205, P80 error from 63.8% to 62.0% and median bias from -8.7% to -3.3%, but the remaining error still indicates material price-level non-uniformity and missing point-in-time property condition. The product continues to expose this as a hard regional gate.

## Material changes implemented in this review

1. **Removed historical assessment leakage.** Earlier tests used a subject's current assessment even though its effective date was not historically aligned. Version 3.1 admits an assessment only when its effective date precedes the tested sale and learns calibration from earlier eligible observations. Production may still use a current assessment as one visible anchor, but validation never claims it was known at the test date.
2. **Remediated Philadelphia without relaxing the gate.** The pipeline now joins qualified taxable single-parcel cash deeds to OPA, preserves granular building styles, selects ZIP/subtype/recency/distance comparable pools and trims PPSF outliers inside each historical fold. The effective-dated assessment cohort improves to 26.8% median and 47.9% P80 error, but the combined market remains compromised.
3. **Capped property confidence by observed market performance.** Good field completeness or close comparable proximity can no longer overwhelm a weak regional model-quality score.
4. **Separated signal from reliability.** Area composites are shrunk toward 50 when competency is weak. Live-listing freshness, completeness and regional competency also shrink the raw signal instead of earning opportunity points.
5. **Simplified the live-listing signal.** The raw score is now 65% property-type-normalized asking price per square foot and 35% market time. It remains a within-response screen, not intrinsic value.
6. **Introduced explicit decision gates.** Pass, watch and compromised states are encoded in the generated model output and the machine-readable `/api/model-quality` scorecard.
7. **Expanded ATTOM with bounded, auditable cost.** Core diligence uses one AVM Detail request. Explicit full diligence can add Expanded Profile, Sales History, Building Permits, Home Equity and Schools for a maximum of six successful responses. All six modules were validated under the current license on one Raleigh property and cached.
8. **Reduced persisted vendor data.** Owner, buyer/seller, mailing, lender identity/contact, loan number and document-number fields are discarded before storage. Mortgage terms, permit facts, sales history, equity and schools remain descriptive and do not automatically change edge.
9. **Removed the temporary validation schedule.** Full ATTOM diligence is on-demand only; the production configuration contains no recurring cron.

## Output clarity and precision review

### Market and neighborhood outputs

The tract-cluster factors are percentile ranks across the product comparison set. They are ordinal and vintage-specific. A score of 80 means stronger relative evidence under the selected lens; it does not mean 80% expected appreciation or an 80% probability of success.

Strengths:

- Exact ACS tract membership is retained and repeatable.
- ACS coverage and margin-of-error-derived reliability travel with each cluster.
- FHFA tract HPI coverage is explicit and separated from the metro benchmark.
- User-selected factor weights are visible.
- Low competency now contracts an extreme raw composite toward neutral.

Remaining issues:

- Demographic, income, education, poverty and housing variables are correlated. A weighted sum can double-count the same latent socioeconomic construct.
- Directional clusters are operationally convenient, not learned housing submarkets.
- Percentiles depend on the current 20-market comparison set and can move when markets are added even if a place does not change.
- ACS five-year estimates are not live economic indicators.
- Demographic and crime layers can create fair-housing and steering risk if treated as recommendation inputs. They should remain contextual exploration layers, never lending, eligibility or protected-class targeting features.

### Property valuation outputs

The center remains a transparent blend of HPI-adjusted prior sale, locally calibrated assessment and similarity-weighted comparable price per square foot. The interval uses the largest of empirical regional P80 error, anchor disagreement and an evidence penalty.

This is acceptable for an MVP screen because each anchor and weight is visible. It is not appraisal-grade because the model lacks verified interior condition, renovation permits translated into effective age, historical assessment vintages, arms-length labels consistently across jurisdictions and sufficiently deep qualified-sale histories in every market.

The new rolling-origin validation is materially more honest, but it is still not a full deployment simulation. Next validation must add geographic blocks, property-type/price strata, a fixed untouched final test window and interval-coverage measurement.

### Live listing outputs

RentCast is appropriately used as a live candidate feed. A single request can return up to 500 active listings, which is efficient for MVP testing. The resulting score is still a relative screen within one provider response. It must not be called a valuation until a listing is joined to the subject property model and the match is verified.

Deal Studio now requests a property-specific rent AVM with address, property type, bedrooms, bathrooms and living area, then calculates P25/median/P75 monthly rent from returned comparable rent per square foot. It requires at least five comparables with both rent and area, shows comp recency and distance, keeps the provider's 85% range separate and never inserts the ACS cluster rent into underwriting. The remaining listing-score precision improvement is a local matched sale cohort; citywide property-type median asking price per square foot is still too coarse for heterogeneous metros.

### ATTOM outputs

ATTOM is correctly treated as a secondary model and evidence channel, not ground truth. Independent-looking AVMs may share public records, so provider agreement is not fully independent evidence. Vendor weight remains capped at 15%; disagreement reduces confidence and agreement does not improve neighborhood fundamentals.

The live entitlement check established that the current key can access all six property modules used by BORO. The cached Raleigh full file returned nine historical sales, four permits, seven schools, tax data and home-equity/LTV fields. This proves endpoint availability, not national match coverage. Match rate and field completeness still require stratified market audits.

ATTOM documents the endpoint structure, API-key header and allowance behavior in its [official API documentation](https://api.developer.attomdata.com/docs).

## Normalization standard

Every feature entering a trained model should carry four timestamps and identifiers:

- `event_time`: when the transaction, listing or incident occurred;
- `valid_from` and `valid_to`: when the fact was true;
- `retrieved_at`: when BORO observed it;
- source, source record ID, property ID and geography version.

Recommended property-model target:

`log(sale_price) - log(local_house_price_index_at_sale)`

This removes broad time-market movement before learning property and location residuals. The model can then reapply the target-date index. Training and validation must use only features whose `valid_from` is no later than the valuation date.

Feature treatment:

| Feature family | Required treatment |
|---|---|
| Price, rent, tax, assessment | Inflation/index vintage, log transform where appropriate, jurisdiction calibration, winsorized only from training folds |
| Living and lot area | Log transform plus missing flag; retain total-price target to avoid naive PPSF size bias |
| Property type and jurisdiction | Ordered categorical handling inside each training fold; never target-encode on the test fold |
| Location | H3/geohash and distance features, learned only from prior transactions; maintain a spatial holdout |
| Recency | Continuous days/months plus bounded decay; do not use arbitrary freshness buckets as economic alpha |
| ACS estimates | Use vintage and margin of error; shrink noisy estimates; do not interpolate a five-year estimate into a live fact |
| FHFA HPI | Use only periods available by the valuation date and preserve coverage |
| ATTOM/RentCast | Preserve provider vintage, match confidence, cache age and license; never silently backfill a missing public field as if it were the same measurement |
| Crime/demographics | Context-only in the default product; excluded from property value, eligibility and investment recommendation models without legal/model-risk approval |

## Model strategy: champion and challengers

### Production champion now

Keep v3.1 as the explainable champion while data collection improves. Its output should remain a range with a gate, never a single authoritative number.

### First challenger: CatBoost or LightGBM quantile ensemble

Once a market has at least 5,000–10,000 qualified, timestamp-safe sales, train a log-price residual model with property, time, spatial and source features. CatBoost is especially attractive for high-cardinality categorical variables and ordered boosting designed to reduce prediction shift from target leakage; see the [NeurIPS CatBoost paper](https://proceedings.neurips.cc/paper/2018/hash/14491b756b3a51daac41c24863285549-Abstract.html). LightGBM is a strong scale baseline; see the [NeurIPS LightGBM paper](https://proceedings.nips.cc/paper/2017/hash/6449f44a102fde848669bdd9eb6b76fa-Abstract.html).

Train median, lower and upper quantiles. Calibrate them with uncertainty-aware conformalized quantile regression. UACQR retains distribution-free marginal coverage while addressing regions with higher epistemic uncertainty; see the [AISTATS 2024 paper](https://proceedings.mlr.press/v238/rossellini24a.html).

### Small-data challenger: TabPFN

TabPFN is worth benchmarking offline in Chicago-like small-data conditions. The 2025 Nature paper reports strong results for tabular datasets up to 10,000 rows and 500 features; see [Accurate predictions on small data with a tabular foundation model](https://www.nature.com/articles/s41586-024-08328-6). It should not ship merely because it is newer. The paper itself notes out-of-distribution and drift as open directions, which are central risks in cross-market real estate. Require superiority on the same spatial-temporal holdouts and interval calibration before promotion.

### Probabilistic challenger: NGBoost

NGBoost directly predicts a conditional distribution and is a useful benchmark for probabilistic valuation; see the [ICML paper](https://proceedings.mlr.press/v119/duan20a.html). Prefer it only if it improves proper scoring rules and calibrated coverage over quantile boosting plus conformal calibration.

### Graph model later, not now

Graph neural networks can represent peer-property and neighborhood relationships. Recent property research reports gains on roughly 200,000 homes using graph message passing; see [Scalable Property Valuation Models via Graph-based Deep Learning](https://arxiv.org/abs/2405.06553). BORO is far below the data volume and graph stability needed to justify this in production. Revisit after at least 50,000 qualified transactions per large market, stable property identity resolution and a spatially blocked evaluation harness.

## Evaluation protocol required before any challenger promotion

1. Freeze a final 6–12 month untouched test window.
2. Use rolling-origin folds inside training and never compute normalization statistics across a future fold.
3. Add geographic blocks and buffers so performance is reported for both nearby interpolation and new-area transfer. Conventional random cross-validation can underestimate error on spatially structured data; the [blockCV paper](https://doi.org/10.1111/2041-210X.13107) documents spatial blocking strategies.
4. Report median APE, MAE in dollars, RMSLE, P80/P90 APE, median ratio, COD, PRD/vertical equity, interval coverage and interval width.
5. Slice every metric by market, property type, price quartile, build-age band, data source, geography, interval age and model-confidence decile.
6. Compare against simple baselines: latest prior sale plus HPI, assessment calibration, median matched-comparable PPSF and the current hybrid.
7. Promote only if the challenger improves the pass markets without degrading any major protected or price/geography slice beyond the agreed tolerance.
8. Require reproducible training data hashes, feature schema, code commit, hyperparameters and rollback artifact.

IAAO's [Standard on Ratio Studies](https://www.iaao.org/wp-content/uploads/Standard_on_Ratio_Studies.pdf) motivates median ratios, dispersion and price-related bias checks. NIST's [AI Risk Management Framework](https://www.nist.gov/publications/artificial-intelligence-risk-management-framework-ai-rmf-10) supports lifecycle validation, monitoring and accountable risk treatment; BORO should use its Govern, Map, Measure and Manage structure for model change control.

## Live-data operating design

| Channel | Current mode | Target SLA | Failure behavior |
|---|---|---|---|
| County/city public records | Versioned build snapshot | Weekly where source permits | Retain last good snapshot; surface age and schema drift |
| ACS/TIGER | Versioned official release | On release | Never imply five-year estimates are current monthly facts |
| FHFA HPI | Versioned official series | Quarterly metro / annual tract | Fall back from tract to metro only with an explicit geography badge |
| RentCast listings | On-demand, six-hour market cache | Request-time | Keep map shell; show provider error; do not substitute stale listings silently |
| RentCast property rent | One explicit AVM call, 15-minute private cache | Underwriting request | Require subject attributes and at least five usable rent/sf comps; leave rent blank otherwise |
| ATTOM core | On-demand, 30-day success cache | Property request | Return module-level unavailable/no-result/error state |
| ATTOM full | Explicit user action, max six counted responses | Diligence only | Never schedule; retain privacy-reduced fields only |
| Crime/open safety | Local official adapters | Source-specific | Context unavailable; never impute a national average into a neighborhood |

Data quality should be decomposed rather than collapsed into one opaque percentage:

- **Coverage:** proportion of required fields/entities observed;
- **Freshness:** decay from the source-specific expected update cadence;
- **Reliability:** sampling error, match quality and source controls;
- **Validation:** out-of-time predictive performance;
- **Consistency:** agreement and definitional compatibility across sources;
- **Lineage:** source, retrieval, schema and transformation reproducibility.

The public “competency” score can summarize these dimensions, but the API and detailed UI must continue to expose the components.

## Monitoring and kill switches

Daily or per-build monitors:

- schema and row-count change;
- source latency and error rate;
- property match rate, duplicate rate and geocode displacement;
- missingness by field/market/source;
- listing and AVM age;
- feature drift (PSI or distribution distance) by market;
- residual bias and interval coverage once later sale outcomes arrive;
- ATTOM/RentCast request count and cache-hit rate;
- percentage of outputs in pass/watch/compromised states.

Automatic downgrade to `watch` when freshness or coverage crosses its threshold. Automatic downgrade to `compromised` when P80 error, bias, interval under-coverage or a critical schema break exceeds its limit for a full evaluation window. A model rollback must not require a frontend deploy.

## Prioritized execution plan

### Next 30 days

- Keep Raleigh as the principal live MVP and Chicago as a watch-market scale test.
- Acquire point-in-time permit, renovation and property-condition evidence for Philadelphia; do not tune weights against the remaining comparable-only error tail.
- Build timestamped property identity and listing-to-parcel match tables.
- Replace citywide type PPSF with local matched listing cohorts.
- Measure ATTOM core match/completeness on a small stratified cached sample per market; do not infer national coverage from the six-address test.
- Add fixed model-output snapshots and regression thresholds to CI.

### Days 31–60

- Expand qualified transaction history to at least 5,000 rows in the first challenger market.
- Add spatial-temporal fold generation and conformal interval evaluation.
- Train CatBoost, LightGBM quantile and TabPFN offline challengers against the same frozen split.
- Backtest the new property rent/sf interval against subsequently observed leases before treating cap rate or cash-on-cash outputs as validated forecasts.
- Version features, data dictionaries, licensing terms and model cards.

### Days 61–90

- Promote a challenger only if it clears the predeclared accuracy, calibration and slice-stability gates.
- Add shadow scoring and outcome monitoring before user-visible replacement.
- Expand to a fourth market only after its source and model gates pass; market count is not a substitute for calibrated coverage.
- Establish quarterly CTO/model-risk review and incident/rollback exercises.

## Final CTO position

The right near-term product is not “AI predicts which neighborhood will win.” It is “BORO makes heterogeneous real-estate evidence comparable, exposes uncertainty and failure modes, and tells the user exactly what must be verified next.”

Version 3.1 moves the implementation materially closer to that standard. Raleigh is the strongest property-level pilot. Chicago is a valuable small-sample watch case. Philadelphia remains visibly compromised after principled remediation because the public data still lacks point-in-time condition and renovation quality. Cutting-edge models should enter as controlled challengers, not as marketing replacements for validation.
