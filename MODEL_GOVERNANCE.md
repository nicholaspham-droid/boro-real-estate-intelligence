# BORO model governance

Last reviewed: 2026-08-11

## Decision boundaries

- Market and cluster scores are ordinal screening ranks, not forecasts or probabilities of profit.
- Cluster factor composites are shrunk toward 50 in direct proportion to integrated data competency. Missing or noisy evidence therefore cannot create an extreme score.
- Property value ranges are evidence summaries, not appraisals.
- Listing scores rank a provider response against its own market baseline; they do not measure intrinsic value.
- Listing freshness, field completeness and regional model competency modify reliability; they do not earn investment points. The underlying signal is limited to relative asking price per square foot and market time.
- ATTOM is an independent commercial cross-check. Agreement may improve evidence competency, but it is not investment alpha.
- Deal and portfolio outputs are scenario calculations. They require verified property, lease, tax, insurance, condition, financing and transaction-cost inputs.

## Property valuation model

The public-record center combines an HPI-adjusted recorded sale, a locally calibrated assessment and similarity-weighted comparable price per square foot. Sale weight declines with age; the assessment remains 20%; comparables receive the remainder. The interval uses the largest of the market's out-of-time 80th-percentile error, anchor disagreement and an evidence-quality penalty.

Validation is rolling-origin: each historical test sale is estimated only from earlier comparable transactions. The subject's current assessment is excluded because its historical effective date is unavailable. Markets are gated pass, watch or compromised using sample size, median error, P80 error and median bias. Current limitations include geographic selection effects, inconsistent arms-length labels, physical-condition omissions, FHFA tract-index lag and no fully untouched spatial-temporal final test window.

## ATTOM secondary signal

The routine core profile uses one AVM Detail request for retained facts, assessment/tax, sale, price per square foot, AVM range, monthly change and data vintage. Successful responses are cached for 30 days and failures for seven days. A bounded six-address control audit costs at most six HTTP-200 responses when fully stale and zero when fully cached. No recurring ATTOM schedule is active; market and full-property checks are explicit user actions.

Full property diligence is explicit and never scheduled. It can attempt five additional documented modules: Expanded Profile for assessment, tax and privacy-reduced mortgage terms; Expanded Sales History; Building Permits; Home Equity; and Property Detail With Schools. Each module reports available, no result, not entitled or error. Owner, buyer/seller, mailing, lender identity/contact, document-number and loan-number fields are discarded before persistence. Mortgage, permit, school, equity and sales-history evidence remains descriptive and does not automatically change the valuation or edge score.

ATTOM weight is gated by AVM confidence and retained-field completeness and is capped at 15%. Vendor disagreement above 15% penalizes integrated confidence. The reliability-adjusted watch score shrinks the public score toward 50 as confidence falls; provider agreement cannot raise neighborhood fundamentals.

## Deal Studio math

- Total basis = asking price + rehab + closing costs.
- Effective rent = gross scheduled rent less vacancy.
- NOI = effective rent less property tax, insurance, HOA and the maintenance reserve.
- Cap rate = NOI / total basis.
- DSCR = NOI / annual amortizing debt service.
- Cash-on-cash = cash flow after debt service / cash invested.
- Maximum offer solves for the selected cap-rate hurdle after rehab and closing costs.

ACS cluster rents are weighted distributions of tract median gross rent, not subject-property rent comps. Taxes and insurance are required before income gates activate. Users must separately verify management, utilities, concessions, turnover, replacement reserves, loan fees and tax treatment.

## Portfolio math

Closing costs are included in acquisition basis, invested cash, price margin, cap rate and cash-on-cash return. The raw opportunity score uses return (40%), price-to-model basis (25%), area fundamentals (20%) and diversification (15%). Evidence competency is no longer an additive return factor; it is a reliability modifier that shrinks the raw score toward neutral.

The rate shock is an indicative refinance scenario. It should not be read as repricing fixed-rate debt before maturity. Default DSCR, LTV, concentration and competency gates are screening policies, not lender terms.

## Required future validation

- Expand out-of-time property tests before comparing market scores as equally calibrated.
- Track ATTOM match rate, error, range overlap and drift by market before increasing its weight.
- Validate ATTOM module entitlements, vintages and field-level missingness before enabling a full-property module by default.
- Replace ACS rent defaults with licensed or verified unit-level rent comps.
- Add property-specific taxes, insurance, management, utilities, capital expenditures, financing fees and exit costs to saved deal cases.
- Add sensitivity tables and scenario probabilities only when their assumptions can be sourced and versioned.

## Sensitive context

Crime and demographic layers are contextual exploration evidence. They are excluded from property valuation, deal eligibility, lending and the default live-listing signal. Any future use in recommendations requires legal and model-risk review for fair-housing, steering, proxy discrimination and data-quality risk.
