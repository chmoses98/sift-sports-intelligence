import { useSearchParams } from 'react-router';
import { Icon } from '../components/Icon';
import { SearchResults } from '../components/SearchResults';
import { useSearch } from '../search/useSearch';
import { useVisit } from '../state/trail';

const EXAMPLES = ['Bills', 'Josh Allen', 'Baltimore pass defense', 'Josh Allen passing yards', 'BUF @', 'explosive', 'Ravens rush defense', 'Drake Maye'];

export function SearchView() {
  const [sp, setSp] = useSearchParams();
  const q = sp.get('q') ?? '';
  const state = useSearch(q);
  useVisit(q ? `Search “${q}”` : 'Search', 'search');
  return (
    <div className="page searchview">
      <form role="search" className="bigsearch" onSubmit={(e) => e.preventDefault()}>
        <Icon name="search" size={20} />
        <input
          autoFocus type="search" value={q} aria-label="Search Sift"
          placeholder="Bills · Josh Allen · Baltimore pass defense · passing yards"
          onChange={(e) => setSp(e.target.value ? { q: e.target.value } : {}, { replace: true })}
        />
      </form>
      {!q && (
        <div className="examples">
          <div className="eyebrow">Try</div>
          <div className="chips">
            {EXAMPLES.map((x) => (
              <button key={x} type="button" className="chipbtn" onClick={() => setSp({ q: x }, { replace: true })}>{x}</button>
            ))}
          </div>
          <p className="muted small">Search reads each sport's published search index on your device: teams, players, games, metrics and rankings, plus the markets of the team or player you name. MLB is searchable too (beta).</p>
        </div>
      )}
      <SearchResults state={state} query={q} />
    </div>
  );
}
