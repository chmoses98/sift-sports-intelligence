import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {test,expect,NOW,CBB_NOW,NEBUF,noHorizontalOverflow} from './fixtures';
const fixture=join(fileURLToPath(new URL('.',import.meta.url)),'..','tests','fixtures');
const cbb=(JSON.parse(readFileSync(new URL('./data/cbb/season/app/latest/events.json',import.meta.url),'utf8')).items as {event_id:string;extensions:{cbb:{cbb_game_id:string}}}[]).find(e=>e.extensions.cbb.cbb_game_id==='G900000005')!.event_id;
// Existing publications; CBB and MLB prop fixture extensions remain explicitly test-only.
const sports=[
 ['nfl',NEBUF,NOW,null],['cfb','evt_93e12676ae9337017c63',new Date('2026-10-08T12:00:00Z'),'cfb-edge-finder/main'],
 ['mlb','evt_f809f61380cdbb0eb4f0',new Date('2026-10-07T20:10:00Z'),'edge-finder-api/main'],
 ['nhl','evt_5938c3f8a7c1b24c0118',new Date('2026-10-06T23:30:00Z'),'NHL-edge-finder/data-archive'],
 ['nba','evt_0787342e3e624193d62e',new Date('2026-10-09T08:00:00Z'),'nba-edge-finder/data-archive'],
 ['soccer','evt_0a69396895a311cb26b2',new Date('2026-10-09T08:00:00Z'),'soccer-edge-finder/data-archive'],
 ['tennis','evt_626bc16043b56b7b1921',new Date('2026-10-09T06:00:00Z'),'Tennis-Edge-Finder/tennis-data/tennis-edge-finder/data'],['cbb',cbb,CBB_NOW.season,null],
] as const;
for(const [slug,id,now,root]of sports)test(`${slug} workspace home, game and deep research @smoke`,async({page,market})=>{
 await page.clock.install({time:now});market.observedAt=now.toISOString();
 if(root){const base=`https://raw.githubusercontent.com/chmoses98/${root}/app/latest/`;await page.context().route(`${base}**`,route=>{const f=join(fixture,slug,'app','latest',route.request().url().slice(base.length).split('?')[0]);return route.fulfill({status:existsSync(f)?200:404,body:existsSync(f)?readFileSync(f,'utf8'):'{}',contentType:'application/json',headers:{'access-control-allow-origin':'*'}});});}
 await page.goto(`#/design/sift2/${slug}`);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();await expect(page.locator('main .skel')).toHaveCount(0);await noHorizontalOverflow(page,slug+' home');
 await page.goto(`#/design/sift2/${slug}/game/${id}`);await expect(page.locator('.game,.nba-game,.soccer-match,.tennis-match,.cbbg')).toBeVisible();await expect(page.locator('main .skel')).toHaveCount(0);await noHorizontalOverflow(page,slug+' game');await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:test.info().outputPath(`${slug}-game.png`),scale:'css'});
 const internal=await page.locator('main a[href]').evaluateAll(els=>els.map(e=>e.getAttribute('href')!).filter(h=>h.startsWith('#/')));expect(internal.filter(h=>!h.startsWith('#/design'))).toEqual([]);
 const deep=page.locator('main a[href*="/market/"],main a[href*="/team/"],main a[href*="/player/"]').filter({visible:true}).first();if(await deep.count()){await deep.click();await expect(page).toHaveURL(/#\/design\/sift2\//);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();await expect(page.locator('main .skel')).toHaveCount(0);await noHorizontalOverflow(page,slug+' research');}
});
test('connected Home, Games, Props, Intelligence, Lab and Board @smoke',async({page})=>{
 await page.clock.install({time:NOW});
 for(const path of ['home','games','props','intelligence','lab','board']){await page.goto(`#/design/sift2/${path}`);await expect(page.getByRole('heading',{level:1}).first()).toBeVisible();await expect(page.locator('main .skel')).toHaveCount(0);if(path==='home')await expect(page.locator('.sift2-home__cards .s2-match-card').first()).toBeVisible();await noHorizontalOverflow(page,path);await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:test.info().outputPath(`${path}.png`),scale:'css'});}
 await page.goto('#/design/sift2/nfl/game/evt_8e764f246d2916e5a347?tab=props');const player=page.locator('.s2-player').first();await expect(player).toBeVisible();const name=(await player.locator('.s2-player__name').innerText()).replace('›','').trim();await player.locator('.s2-player__markets>a').first().click();await expect(page).toHaveURL(/#\/design\/sift2\/nfl\/props\?/);await expect(page.locator('#pexa-t')).toContainText(name);await noHorizontalOverflow(page,'Focused prop');
});
