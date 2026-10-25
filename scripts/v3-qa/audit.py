import sys, json; import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from qa import QA
ROUTES = ['/v3?demo=1','/v3/games','/v3/games?state=live','/v3/game/cfb/demo_uga_fla','/v3/game/cfb/demo_ore_wash','/v3/game/cfb/demo_uga_fla?tab=matchup','/v3/game/cfb/demo_uga_fla?tab=props','/v3/team/cfb/UGA','/v3/stat/nfl/sample-0','/v3/stat/nfl/sample-0?tab=trends','/v3/player/nba/sample-guard','/v3/player/nba/sample-guard?tab=log','/v3/player/nba/sample-guard?tab=replay','/v3/explore','/v3/explore?q=sa','/v3/following','/v3/settings']
JS = '''
const out={overflow: document.documentElement.scrollWidth - innerWidth, small: [], clipped: []};
// content pushed past the right edge and hidden by the shell's overflow-x: clip (scroll rails excluded)
const inRail = (e)=>{ for (let p=e.parentElement;p&&p!==document.body;p=p.parentElement){ const o=getComputedStyle(p).overflowX; if(o==='auto'||o==='scroll') return true; } return false; };
for (const e of document.querySelectorAll('.v3-main *')){ const r=e.getBoundingClientRect(); if(r.width&&r.height&&r.right>innerWidth+1&&!inRail(e)&&!e.closest('svg')&&!e.closest('[aria-hidden="true"]')){ out.clipped.push((e.className&&e.className.baseVal===undefined?e.className:e.tagName)+' right='+Math.round(r.right)); } }
out.clipped=[...new Set(out.clipped)].slice(0,6);
const els=[...document.querySelectorAll('a[href],button,input,select,[role=button],[role=tab],[role=switch]')];
for (const e of els){
  if (e.closest('[aria-hidden="true"]')) continue;
  const r=e.getBoundingClientRect(); if(!r.width||!r.height) continue;
  const cs=getComputedStyle(e); if(cs.visibility==='hidden'||cs.display==='none') continue;
  if (e.tagName==='INPUT' && (e.type==='radio'||e.type==='checkbox')) continue;
  if (Math.min(r.width,r.height) < 40) out.small.push((e.getAttribute('aria-label')||e.textContent||e.className||e.tagName).trim().slice(0,40)+' '+Math.round(r.width)+'x'+Math.round(r.height));
}
out.small=[...new Set(out.small)].slice(0,8);
return out;
'''
res = {}
for (w,h) in [(390,844),(375,667),(430,932)]:
    q = QA(w,h)
    try:
        q.open('/v3?demo=1', settle=8)
        for r in ROUTES[1:] if False else ROUTES:
            q.open(r, settle=2.8)
            q.shot(f'shots/m_{w}_{r.replace("/","_").replace("?","_").replace("=","_")}.png')
            o = q.js(JS)
            res[f'{w}x{h} {r}'] = o
    finally:
        q.close()
json.dump(res, open('audit.json','w'), indent=1)
bad = {k:v for k,v in res.items() if v['overflow']>0 or v['clipped']}
print(len(res),'pages;', len(bad),'with findings')
for k,v in bad.items(): print(k, 'overflow',v['overflow'], 'clipped', v['clipped'])
