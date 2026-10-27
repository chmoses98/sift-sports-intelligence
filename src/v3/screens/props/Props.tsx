// Prop Discovery: the cross-game index of Kalshi player-prop contracts joined to players, as three views of one address (`/v3/props`):
// the home (PD1), the list with its in-place peek (PD2, PD3) and the comparison (PD5). The filter sheet (PD4) and the exact-contract sheet
// (PD6, registered by ui/ContractSheet) open over them. Everything the viewer chose is in the address, so Back restores it exactly.
import './props.css';
import { DataState } from '../../ui/DataState';
import { usePropUniverse } from '../../data/props/hooks';
import { viewOf } from '../../data/props/query';
import { propsSchema } from '../../nav/schemas';
import { useRouteState } from '../../state/url';
import { Icon } from '../../ui/Icon';
import { PropsCompare } from './Compare';
import { PropsHome } from './PropsHome';
import { PropsList } from './PropsList';
import { useSlate } from '../../data/useSlate';
import { useLocation } from '../../../routing';
import { useHistoryBank } from '../../data/props/bank';
import { usePublishContracts } from './contracts';

export function Props() {
  const [st, set] = useRouteState(propsSchema);
  const { universe, loading, error, retry } = usePropUniverse();
  const slate = useSlate();
  // A shared address (?sheet=contract&tk=…) opened cold: the sheet needs the contract's own prop even before any row is on screen.
  const loc = useLocation();
  const bank = useHistoryBank();
  const tk = new URLSearchParams(loc.search).get('tk');
  const owner = universe && tk ? universe.byId.get(tk.split('-').slice(0, -1).join('-')) ?? null : null;
  usePublishContracts([owner], bank.get, bank.getVersion());
  if (!universe) {
    return (
      <div className="pd" data-view="loading">
        <header className="pd-h"><div className="pd-h__tt"><h1>Props</h1></div><div className="pd-h__sub">{loading ? 'Reading today’s contracts…' : ''}</div></header>
        {loading ? (
          <div className="pd-skel" role="status" aria-label="Loading props"><div className="v3-skel" style={{ height: 44 }} /><div className="v3-skel" style={{ height: 36 }} /><div className="v3-skel" style={{ height: 150 }} /><div className="v3-skel" style={{ height: 150 }} /></div>
        ) : (
          <div className="v3-state pd-empty"><Icon name="info" size={20} /><div><b>Props are unavailable right now</b>{slate.unavailable || error ? 'No publication could be read.' : 'There are no upcoming games with player props.'}<br /><button type="button" onClick={() => location.reload()}>Try again</button></div></div>
        )}
      </div>
    );
  }
  // Every game's contract list failed: say so at the top, with Retry, instead of a list of zero props and a note at the bottom.
  if (universe.props.length === 0 && universe.unreadable.length > 0 && !universe.demo) {
    return (
      <div className="pd" data-view="unavailable">
        <header className="pd-h"><div className="pd-h__tt"><h1>Props</h1></div></header>
        <DataState title="Props unavailable" why={`the contract lists for ${universe.unreadable.slice(0, 4).join(', ')}${universe.unreadable.length > 4 ? ` and ${universe.unreadable.length - 4} more` : ''} could not be read`} retry={retry} alert>The player props</DataState>
      </div>
    );
  }
  const view = viewOf(st);
  if (view === 'compare') return <PropsCompare st={st} universe={universe} />;
  if (view === 'list') return <PropsList st={st} set={set} universe={universe} />;
  return <PropsHome universe={universe} />;
}
