"""InfFyn scenario exploration. No customer-calibrated probability claims.

Run: python research/commercial-model-2026-09-11/simulate.py
Dependencies: numpy, matplotlib. Writes only into this research directory.
All distributions below are judgment assumptions, NOT measured estimates.
"""
from pathlib import Path
import csv
import json
import math
import hashlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

HERE = Path(__file__).resolve().parent
SEED = 20260911
N = 50_000
MONTHS = 24
PRICE = 349.0
OWNER_ALLOWANCE = 8_000.0

# Triples are minimum, mode, maximum triangular assumptions.
SCENARIOS = {
    'limited': dict(label='Limited reach / difficult onboarding',
        introductions=[2,4,8], discovery=[.35,.55,.75], data_ready=[.25,.45,.70],
        paid_conversion=[.12,.25,.40], monthly_churn=[.04,.07,.12],
        lead_growth=[-.01,0,.015], support_hours=[2,3,5], onboarding_hours=[5,9,16],
        service_capacity=60, partner_share=[0,.05,.10], fixed_opex=1000),
    'focused': dict(label='Focused CFO-led business',
        introductions=[4,8,14], discovery=[.50,.70,.85], data_ready=[.45,.65,.85],
        paid_conversion=[.25,.40,.60], monthly_churn=[.015,.03,.055],
        lead_growth=[0,.02,.04], support_hours=[.6,1.25,2.5], onboarding_hours=[3,6,10],
        service_capacity=80, partner_share=[0,.10,.20], fixed_opex=1500),
    'channel': dict(label='Repeatable multi-advisor channel',
        introductions=[6,12,20], discovery=[.55,.75,.90], data_ready=[.55,.75,.90],
        paid_conversion=[.30,.50,.65], monthly_churn=[.008,.02,.04],
        lead_growth=[.025,.05,.075], support_hours=[.3,.65,1.25], onboarding_hours=[2,3,6],
        service_capacity=160, partner_share=[.10,.20,.30], fixed_opex=3000),
}

def triangular_ppf(u, triple):
    a, mode, b = triple
    if a == b:
        return np.full_like(u, a)
    pivot = (mode-a)/(b-a)
    return np.where(u < pivot, a+np.sqrt(u*(b-a)*(mode-a)),
                    b-np.sqrt((1-u)*(b-a)*(b-mode)))

def normal_cdf(x):
    return .5*(1+np.fromiter((math.erf(float(y)/math.sqrt(2)) for y in x), float, count=len(x)))

def parameters(name, n, seed, overrides=None, independent=False):
    rng = np.random.default_rng(seed)
    config = SCENARIOS[name]
    latent = rng.normal(size=n)
    values = {}
    correlated = {'discovery':1, 'data_ready':1, 'paid_conversion':1,
                  'monthly_churn':-1, 'support_hours':-1, 'onboarding_hours':-1}
    for key, value in config.items():
        if not isinstance(value, list):
            continue
        if key in correlated and not independent:
            # Pairwise latent-normal correlation +/-.5. Marginals stay triangular.
            z = math.sqrt(.5)*latent*correlated[key]+math.sqrt(.5)*rng.normal(size=n)
            u = normal_cdf(z)
        else:
            u = rng.uniform(size=n)
        values[key] = triangular_ppf(u, value)
    values['labor_rate'] = rng.triangular(50,75,120,size=n)
    values['platform_cost_per_customer'] = rng.triangular(8,12,25,size=n)
    values['activation_delay'] = rng.choice([0,1,2], size=n, p=[.5,.3,.2])
    for key, value in (overrides or {}).items():
        values[key] = np.full(n, value, dtype=float)
    return rng, values

def simulate(name, n=N, seed=SEED, overrides=None, independent=False, channel_pause=False):
    rng, p = parameters(name, n, seed, overrides, independent)
    cfg = SCENARIOS[name]
    active = np.zeros(n, dtype=int)
    waiting = [np.zeros(n,dtype=int), np.zeros(n,dtype=int)]
    arrays = {k:np.zeros((n,MONTHS)) for k in
              ['active','new','churned','billable_months','delivery_hours','lost_capacity','introduced']}
    capacity = cfg['service_capacity']
    for m in range(MONTHS):
        live = m >= p['activation_delay']
        elapsed = np.maximum(0, m-p['activation_delay'])
        intensity = np.minimum(60, p['introductions']*(1+p['lead_growth'])**elapsed)*live
        if channel_pause and 6 <= m < 12:
            intensity *= .2
        introduced = rng.poisson(intensity)
        discovery = rng.binomial(introduced, p['discovery'])
        data_ready = rng.binomial(discovery, p['data_ready'])
        eventual_paid = rng.binomial(data_ready, p['paid_conversion'])
        eligible = waiting.pop(0)
        waiting.append(eventual_paid)
        churned = rng.binomial(active, p['monthly_churn'])
        survivors = active-churned
        available = np.maximum(0, capacity-survivors*p['support_hours'])
        onboard_slots = np.floor(available/(p['onboarding_hours']+.5*p['support_hours'])).astype(int)
        new = np.minimum(eligible,onboard_slots)
        active = survivors+new
        billable = survivors+.5*new
        hours = billable*p['support_hours']+new*p['onboarding_hours']
        assert np.all(hours <= capacity+1e-8), 'Delivery capacity exceeded'
        for key, value in dict(active=active,new=new,churned=churned,billable_months=billable,
                delivery_hours=hours,lost_capacity=eligible-new,introduced=introduced).items():
            arrays[key][:,m] = value
    return dict(name=name,n=n,parameters=p,arrays=arrays)

def economics(result, price=PRICE):
    p, a = result['parameters'],result['arrays']
    cfg = SCENARIOS[result['name']]
    revenue = a['billable_months']*price
    mrr = a['active']*price
    # Fees and delivery costs are separated from subscription revenue.
    variable = revenue*(.032+p['partner_share'][:,None])
    variable += a['billable_months']*p['platform_cost_per_customer'][:,None]
    variable += a['delivery_hours']*p['labor_rate'][:,None]
    contribution = revenue-variable
    before_owner = contribution-cfg['fixed_opex']
    surplus = before_owner-OWNER_ALLOWANCE
    return dict(mrr=mrr,revenue=revenue,contribution=contribution,surplus=surplus,
                before_owner=before_owner,cumulative_surplus=surplus.sum(axis=1),run_rate_arr=mrr*12)

def describe(v):
    q=np.quantile(v,[.1,.25,.5,.75,.9])
    return dict(mean=round(float(np.mean(v)),2),p10=round(float(q[0]),2),
                p25=round(float(q[1]),2),median=round(float(q[2]),2),
                p75=round(float(q[3]),2),p90=round(float(q[4]),2))

def summary(result, price=PRICE):
    a=result['arrays']; e=economics(result,price)
    s=dict(scenario=result['name'],runs=result['n'],price=price,
           cumulative_24m_revenue=describe(e['revenue'].sum(axis=1)),
           cumulative_24m_surplus=describe(e['cumulative_surplus']),
           capacity_lost_24m=describe(a['lost_capacity'].sum(axis=1)))
    for month in [12,24]:
        i=month-1
        s[f'month_{month}'] = dict(customers=describe(a['active'][:,i]),
            mrr=describe(e['mrr'][:,i]),run_rate_arr=describe(e['run_rate_arr'][:,i]),
            revenue_in_month=describe(e['revenue'][:,i]),
            contribution=describe(e['contribution'][:,i]),surplus=describe(e['surplus'][:,i]),
            before_owner_allowance=describe(e['before_owner'][:,i]),
            delivery_hours=describe(a['delivery_hours'][:,i]),
            share_paths_mrr_over_10k=round(float(np.mean(e['mrr'][:,i]>=10000)),4),
            share_paths_mrr_over_25k=round(float(np.mean(e['mrr'][:,i]>=25000)),4),
            share_paths_mrr_over_50k=round(float(np.mean(e['mrr'][:,i]>=50000)),4),
            share_paths_positive_surplus=round(float(np.mean(e['surplus'][:,i]>0)),4))
    return s

def self_check():
    zero=simulate('focused',100,overrides={'introductions':0})
    assert not zero['arrays']['active'].any()
    assert not economics(zero)['revenue'].any()
    assert np.all(economics(zero)['surplus']==-9500)
    no_churn=simulate('focused',100,overrides={'monthly_churn':0})
    assert np.all(np.diff(no_churn['arrays']['active'],axis=1)>=0)
    repeat=simulate('focused',100,overrides={'monthly_churn':0})
    assert np.array_equal(no_churn['arrays']['active'],repeat['arrays']['active'])
    e=economics(no_churn)
    assert np.allclose(e['mrr']*12,e['run_rate_arr'])
    assert np.allclose(e['cumulative_surplus'],e['surplus'].sum(axis=1))
    assert np.all(no_churn['arrays']['active']>=0)
    assert not no_churn['arrays']['new'][:,:2].any()
    assert np.allclose(economics(no_churn,900)['mrr'],e['mrr']*900/349)
    print('Model checks passed: zero funnel, churn, lag, repeatability, cash identities, repricing.',flush=True)

def main():
    self_check()
    results={name:simulate(name) for name in SCENARIOS}
    output=dict(date='2026-09-11',seed=SEED,main_paths=N*len(SCENARIOS),months=MONTHS,
       status='JUDGMENT_BASED_CONDITIONAL_SCENARIOS_NOT_CUSTOMER_CALIBRATED',
       assumptions=SCENARIOS,price=PRICE,owner_allowance=OWNER_ALLOWANCE,
       notes=[
        'Zero starting customers; paid service begins after successful activation and billing authorization.',
        'Month 1 is the planning start, not a promised calendar launch. Activation delay 0/1/2 months with assumed weights .5/.3/.2.',
        'Persistent business parameters vary by run; Poisson lead arrivals and binomial funnel/churn vary monthly.',
        'Two-month intro-to-paid lag. First billing month is half-month. All paid customers use same price; no expansion or setup fee.',
        'Churn occurs at month start; departing customers contribute no revenue or support hours that month. Contract collection timing is not modeled.',
        'Capacity rejected candidates are lost, not backlogged. Service capacity is hours allocated to this product, not total working time.',
        'Six adoption/friction parameters share a .5 latent-normal factor with directional signs. This correlation is assumed.',
        'Labor $50/$75/$120 per delivered hour, platform $8/$12/$25 per billable account month; 3.2% payment cost.',
        'Partner share and fixed nonlabor overhead are scenario-specific; $8k monthly combined owner allowance covers non-delivery work.',
        'Delivery labor is costed even if founders perform it; owner allowance is additional for sales/engineering/admin, avoiding free labor.',
        'Surplus is pre-tax after modeled costs/allowance, not owner take-home. Excludes sunk build costs, VAT, financing, bad debts, annual contract timing.',
        'Cumulative surplus includes imputed delivery labor and owner allowance; it is not required external financing or cash burn unless all costs are actually paid.',
        'Assumes business continues 24 months with resources to cover modeled deficits. No estimated probability of getting access, survival, PMF or any scenario.',
        'High-price outputs reuse acquisition/retention paths. Demand elasticity is unknown; they are arithmetic sensitivity, not higher-price forecasts.',
        'Advisor case presupposes recruiting and enabling multiple advisors; Stephen alone has not been shown to provide this throughput.',
        'Monthly introductions cap at 60; the reachable market and exhaustion of the contact network have not been measured.',
       ],baseline={k:summary(v) for k,v in results.items()},
       repricing_900={k:summary(v,900) for k,v in results.items()})
    trajectories={}
    for key,result in results.items():
        e=economics(result)
        trajectories[key]=[dict(month=m+1,**describe(e['mrr'][:,m])) for m in range(MONTHS)]
        # Auditable run-level outcomes, not a giant fabricated customer dataset.
        with (HERE/f'{key}-paths.csv').open('w',newline='',encoding='utf-8') as f:
            writer=csv.writer(f)
            writer.writerow(['run','customers_m12','customers_m24','mrr_m12','mrr_m24','revenue_24m',
                             'surplus_m24','surplus_24m','capacity_lost_24m'])
            for i in range(N):
                writer.writerow([i+1,int(result['arrays']['active'][i,11]),int(result['arrays']['active'][i,23]),
                    round(e['mrr'][i,11],2),round(e['mrr'][i,23],2),round(e['revenue'][i].sum(),2),
                    round(e['surplus'][i,23],2),round(e['cumulative_surplus'][i],2),
                    int(result['arrays']['lost_capacity'][i].sum())])
    output['trajectories']=trajectories
    output['sensitivity']={}
    # Explicit controlled perturbations; no causal or empirical interpretation.
    for key,values in dict(introductions=[4,8,16],data_ready=[.35,.65,.85],
            monthly_churn=[.01,.03,.07],support_hours=[.5,1.25,3]).items():
        output['sensitivity'][key]=[dict(value=v,summary=summary(simulate('focused',20_000,overrides={key:v}))) for v in values]
    output['stress']={
        'six_month_80pct_referral_pause':summary(simulate('focused',20_000,channel_pause=True)),
        'independent_parameters':summary(simulate('focused',20_000,independent=True)),
        'second_seed':summary(simulate('focused',20_000,seed=20260912)),
    }
    output['additional_sensitivity_paths']=300_000
    (HERE/'results.json').write_text(json.dumps(output,indent=2),encoding='utf-8')
    plt.rcParams.update({'font.family':'DejaVu Sans','axes.spines.top':False,'axes.spines.right':False,
                         'axes.titlesize':12,'axes.labelsize':10})
    fig, axes=plt.subplots(1,3,figsize=(14,4.9),sharey=True)
    colors=['#8a6235','#176345','#436c94']
    for ax,(key,rows),color in zip(axes,trajectories.items(),colors):
        x=[r['month'] for r in rows]
        ax.fill_between(x,[r['p10']/1000 for r in rows],[r['p90']/1000 for r in rows],color=color,alpha=.16,label='P10-P90')
        ax.plot(x,[r['median']/1000 for r in rows],color=color,lw=2,label='Median')
        ax.plot(x,[r['mean']/1000 for r in rows],color=color,lw=1,ls='--',label='Mean')
        ax.set_title(SCENARIOS[key]['label'].replace(' / ','\n'))
        ax.set_xlabel('Month from planning start'); ax.set_xticks([1,6,12,18,24]); ax.grid(axis='y',alpha=.15)
    axes[0].set_ylabel('Monthly recurring revenue ($ thousands)')
    axes[-1].legend(frameon=False,fontsize=9)
    fig.suptitle('InfFyn: 150,000 conditional business paths at $349/company/month',fontweight='bold')
    fig.text(.5,.015,'50,000 runs per case | Judgment assumptions, not market-calibrated probabilities | Zero starting customers | USD',ha='center',fontsize=9)
    fig.tight_layout(rect=[0,.055,1,.92]); fig.savefig(HERE/'revenue-scenarios.png',dpi=180);plt.close(fig)
    # A second visual shows why recurring revenue alone is not business income.
    fig,ax=plt.subplots(figsize=(10,4.8))
    pos=np.arange(3); width=.34
    for offset,price,color in [(-width/2,349,'#176345'),(width/2,900,'#a16929')]:
        vals=[summary(results[k],price)['month_24']['surplus'] for k in SCENARIOS]
        med=np.array([v['median'] for v in vals])/1000
        low=np.array([v['p10'] for v in vals])/1000;high=np.array([v['p90'] for v in vals])/1000
        ax.bar(pos+offset,med,width,color=color,label=f'${price}/month' + (' sensitivity*' if price==900 else ' configured offer'))
        ax.errorbar(pos+offset,med,yerr=[med-low,high-med],fmt='none',ecolor='#333333',capsize=4)
    ax.axhline(0,color='#555555',lw=1);ax.set_xticks(pos,['Limited reach','Focused CFO-led','Multi-advisor channel'])
    ax.set_ylabel('Month 24 modeled surplus ($ thousands)');ax.legend(frameon=False)
    ax.set_title('After delivery labor, partner fees, platform costs, overhead and $8k owner allowance')
    fig.text(.5,.015,'Median with P10-P90. *$900 assumes unchanged acquisition/churn: price sensitivity, not a validated offer or earnings prediction.',ha='center',fontsize=8.5)
    fig.tight_layout(rect=[0,.06,1,1]);fig.savefig(HERE/'operating-surplus.png',dpi=180);plt.close(fig)
    receipt={'seed':SEED,'main_paths':N*len(SCENARIOS),'sensitivity_paths':300000,
             'numpy_version':np.__version__,'matplotlib_version':matplotlib.__version__,
             'script_sha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
             'results_sha256':hashlib.sha256((HERE/'results.json').read_bytes()).hexdigest(),
             'checks':'passed','real_customer_observations':0}
    (HERE/'run-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
    print(json.dumps({k:{'m12':v['month_12']['mrr'],'m24':v['month_24']['mrr'],
                        'surplus_m24':v['month_24']['surplus']} for k,v in output['baseline'].items()},indent=2))

if __name__=='__main__':
    main()
