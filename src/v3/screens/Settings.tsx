import { useNavigate } from '../../routing';
import { clearAllLocal, setPrefs, usePrefs } from '../state/prefs';
import { Icon } from '../ui/Icon';
import { useSlate } from '../data/useSlate';
import type { PriceFormat } from '../model/format';

const FORMATS: [PriceFormat, string, string][] = [['cents', 'Prediction market (¢ and %)', '54¢ · 54% implied'], ['american', 'American', '−117'], ['decimal', 'Decimal', '1.85']];

export function Settings() {
  const p = usePrefs();
  const nav = useNavigate();
  const { demo } = useSlate();
  return (
    <div className="v3-page">
      <header className="v3-pgbar"><button type="button" className="v3-iconbtn" aria-label="Back" onClick={() => nav(-1)}><Icon name="back" size={26} /></button><h1>Settings</h1><span /></header>
      <section aria-label="Price display">
        <h2 className="v3-h2">Price display</h2>
        <ul className="v3-panel v3-radios">{FORMATS.map(([k, label, ex]) => <li key={k}><label><input type="radio" name="fmt" checked={p.priceFormat === k} onChange={() => setPrefs({ priceFormat: k })} /><span><b>{label}</b><small>{ex}</small></span></label></li>)}</ul>
        <p className="v3-note">Prices are Kalshi contract asks. The % beside a price is the market's implied probability (pre-fee), never SIFT's own model number. Changes apply immediately.</p>
      </section>
      <section aria-label="Appearance">
        <h2 className="v3-h2">Appearance</h2>
        <ul className="v3-panel v3-list" style={{ padding: '0 16px' }}>
          <li><label className="v3-switchrow"><span>Larger text</span><input type="checkbox" role="switch" checked={p.textScale === 'large'} onChange={(e) => setPrefs({ textScale: e.target.checked ? 'large' : 'default' })} /><i aria-hidden="true" /></label></li>
          <li><label className="v3-switchrow"><span>Reduce motion</span><input type="checkbox" role="switch" checked={p.reduceMotion} onChange={(e) => setPrefs({ reduceMotion: e.target.checked })} /><i aria-hidden="true" /></label></li>
        </ul>
        <p className="v3-note">SIFT is dark by default. It also follows your phone's Reduce Motion setting.</p>
      </section>
      <section aria-label="Notifications">
        <h2 className="v3-h2">Notifications</h2>
        <div className="v3-state"><Icon name="bell" size={20} /><div><b>Off by default, per item</b>Tap a bell on a game, team or player to choose what you want. This build only records the choice on this device; it never asks your phone for permission.</div></div>
      </section>
      <section aria-label="Data">
        <h2 className="v3-h2">Data and privacy</h2>
        <div className="v3-state"><Icon name="shield" size={20} /><div><b>{demo ? 'Showing sample data' : 'Showing real published data'}</b>{demo ? 'Scores, prices and stats are fictional so the design can be previewed.' : 'Research comes from the sport publications; prices are Kalshi quotes with their real age. Scores appear only where a licensed feed exists.'}<br />
          <a href={demo ? '#/v3?demo=0' : '#/v3?demo=1'} style={{ color: 'var(--sift-cyan)' }}>{demo ? 'Switch to real data' : 'Preview with sample data'}</a></div></div>
        <button type="button" className="v3-btn v3-btn--ghost" onClick={() => { if (confirm('Remove follows, alerts, saved research and recents from this device?')) clearAllLocal(); }}>Clear data on this device</button>
        <p className="v3-note v3-note--dim">Everything you follow, save or choose stays on this device. No account is needed.</p>
        <p className="v3-note v3-note--dim">Build {__SIFT_BUILD__} · {demo ? 'sample data' : 'real data'}</p>
      </section>
    </div>
  );
}
