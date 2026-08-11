# BORO model governance

Last reviewed: 2026-08-11

## Decision boundaries

- Market and cluster scores are ordinal screening ranks, not forecasts or probabilities of profit.
- Property value ranges are evidence summaries, not appraisals.
- Listing scores rank a provider response against its own market baseline; they do not measure intrinsic value.
- ATTOM is an independent commercial cross-check. Agreement may improve evidence competency, but it is not investment alpha.
- Deal and portfolio outputs are scenario calculations. They require verified property, lease, tax, insurance, condition, financing and transaction-cost inputs.

## Property valuation model

The public-record center combines an HPI-adjusted recorded sale, a locally calibrated assessment and similarity-weighted comparable price per square foot. Sale weight declines with age; the assessment remains 20%; comparables receive the remainder. The interval uses the largest of the market's out-of-time 80th-percentile error, anchor disagreement and an evidence-quality penalty.

Validation is out of time: each historical test sale is estimated only from earlier transactions. Current limitations include small market samples, geographic selection effects, assessment-cycle differences, non-arm's-length transaction risk, physical-condition omissions and FHFA tract-index lag.

## ATTOM secondary signal

One AVM Detail request supplies the retained fact, assessment, sale and AVM fields. Successful responses are cached for 30 days and failures for seven days. The intended weekly scheduler checks two controls per live property market, so a fully stale three-market run costs at most six requests; fresh runs cost zero. Scheduling stays paused whenever provider authentication or product entitlement is unhealthy.

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
- Replace ACS rent defaults with licensed or verified unit-level rent comps.
- Add property-specific taxes, insurance, management, utilities, capital expenditures, financing fees and exit costs to saved deal cases.
- Add sensitivity tables and scenario probabilities only when their assumptions can be sourced and versioned.
