import {describe,it,expect} from 'vitest';
import {workspaceTarget,workspacePath} from '../src/lib/workspaceRoutes';
import {selectProp} from '../src/views/props/selection';
describe('workspace routing and focused research',()=>{
  it.each(['/nfl/player/p','/nhl/market/m?event=e','/board','/settings','/intelligence/pulse?sport=nba'])('scopes %s only inside the opt-in workspace',to=>{expect(workspaceTarget(to,'/design/sift2/home')).toBe('/design/sift2'+to);expect(workspaceTarget(to,'/nfl')).toBe(to);});
  it.each(['?q=a','#players','../props','https://example.com','//example.com','/design/sift2/home'])('preserves relative/external/already scoped links %s',to=>expect(workspaceTarget(to,'/design/sift2/home')).toBe(to));
  it('maps logical destinations and preserves object targets',()=>{expect(workspaceTarget('/explore?sport=cfb#stats','/design/sift2/home')).toBe('/design/sift2/lab?sport=cfb#stats');expect(workspacePath('/design/sift2/home')).toBe('/');expect(workspaceTarget({pathname:'/nfl/player/p',search:'?a=b'},'/design/sift2/props')).toEqual({pathname:'/design/sift2/nfl/player/p',search:'?a=b'});});
  const rows=[{id:'a',playerId:'p',def:{stat:'passing_yards'}},{id:'b',playerId:'p',def:{stat:'rushing_yards'}}];
  it('selects the actual linked player/stat',()=>expect(selectProp(rows,new URLSearchParams('player=p&stat=rushing_yards'),rows[0])).toBe(rows[1]));
  it('does not replace missing focus with another market',()=>expect(selectProp(rows,new URLSearchParams('player=missing'),rows[0])).toBeNull());
});
