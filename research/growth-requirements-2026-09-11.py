"""Target-backwards planning arithmetic; no estimated success probabilities."""
from pathlib import Path
import json
import math

base=Path(__file__).resolve().parent
price=349
months=12
sales_lag=2
churn=.03
active_months=months-sales_lag
factor=sum((1-churn)**i for i in range(active_months))
rows=[]
for target in [50,100,144]:
    wins=target/factor
    rows.append(dict(target_active_customers=target,mrr_usd=target*price,
        gross_wins_per_month=round(wins,3),
        opportunities_per_month={str(rate):round(wins/rate,3) for rate in [.15,.25,.40]},
        rounded_monthly_plan_at_25pct=dict(gross_wins=math.ceil(wins),qualified_opportunities=math.ceil(math.ceil(wins)/.25))))
unit=[]
for hours in [.25,1,3]:
    costs=price*(.032+.10)+12+hours*75
    unit.append(dict(recurring_operator_hours=hours,monthly_contribution_usd=round(price-costs,2),
        contribution_percent=round((price-costs)/price*100,1)))
assert abs(factor-(1-(1-churn)**active_months)/churn)<1e-10
assert all(abs(r['gross_wins_per_month']*factor-r['target_active_customers'])<.01 for r in rows)
result=dict(type='TARGET_REQUIREMENTS_NOT_FORECAST',price_usd=price,months=months,
    sales_lag_months=sales_lag,monthly_logo_churn=churn,acquisition_months=active_months,
    steady_wins_survival_factor=factor,targets=rows,unit_economics=unit,
    assumptions=[
        'Zero starting customers; constant gross wins during months 3-12, churn at month start.',
        'Qualified opportunity means completed discovery, suitable problem, buyer and usable-data path; not a cold lead or website visit.',
        'Close rate and churn are planning sensitivities, not observed rates. Opportunity throughput must be available early enough for sales lag.',
        'No acquisition ramp, supply constraint, onboarding capacity or failure-to-launch branch; actual staffing and funnel must be separately planned.',
        'Required wins are expected-rate arithmetic, not a guaranteed quota outcome or a probability of hitting the target.',
        'Recurring contribution deducts assumed 3.2% payments, 10% partner share, $12 platform cost and $75/hour labor.',
        'Unit contribution excludes onboarding, acquisition, engineering, fixed overhead, tax and founder compensation; it is not net profit.',
        'No change to approved pricing, partner contracts, payment activation or outreach authorization.'
    ])
(base/'growth-requirements-2026-09-11.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
