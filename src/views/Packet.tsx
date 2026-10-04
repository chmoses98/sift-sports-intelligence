// COPY FOR CHATGPT. Builds the contract's handicap packet (src/packet/, a byte-faithful port of
// packet.py) in the browser from the published root, then copies its clipboard text. The copy is a
// separate tap after the build so iOS keeps the user gesture that clipboard writes require.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useRepo } from '../data/hooks';
import { sportBySlug } from '../data/sports';
import { Icon } from '../components/Icon';
import { ErrorState, FreshnessChip, Notice, QualityBadge, Skeleton, Stratum } from '../components/ui';
import { buildPacket, type HandicapPacket } from '../packet/build';
import { renderText } from '../packet/render';
import { makeTray } from '../packet/tray';
import { routes } from '../lib/routes';
import { useTray } from '../state/tray';
import { useVisit } from '../state/trail';
import { REF_WORD } from '../components/TrayDrawer';

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall back below */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export function PacketView() {
  const [sp] = useSearchParams();
  const sport = sportBySlug(sp.get('sport') ?? 'nfl');
  const scope = (sp.get('scope') ?? 'GAME').toUpperCase() as 'GAME' | 'SLATE' | 'CUSTOM';
  const eventId = sp.get('event') ?? undefined;
  const start = sp.get('start') ?? undefined;
  const end = sp.get('end') ?? undefined;
  const repo = useRepo(sport);
  const tray = useTray();
  const trayItems = useMemo(() => tray.tray.items.filter((i) => i.sport === sport?.code), [tray.tray.items, sport]);
  const trayKey = trayItems.map((i) => i.item_id + (i.note ?? '')).join(',');
  const [packet, setPacket] = useState<HandicapPacket | null>(null);
  const [text, setText] = useState<string>('');
  const [progress, setProgress] = useState('Preparing');
  const [error, setError] = useState<Error | null>(null);
  const [copied, setCopied] = useState<'idle' | 'ok' | 'fail'>('idle');
  const [full, setFull] = useState(false);
  const pre = useRef<HTMLPreElement>(null);
  useVisit(`${scope === 'CUSTOM' ? 'Tray' : scope === 'SLATE' ? 'Slate' : 'Game'} packet`, 'packet');

  useEffect(() => {
    if (!repo.data || !sport) return;
    let alive = true;
    setPacket(null);
    setError(null);
    setCopied('idle');
    const req =
      scope === 'CUSTOM'
        ? { scope, tray: makeTray(trayItems, new Date()) }
        : scope === 'SLATE'
          ? { scope, windowStart: start, windowEnd: end }
          : { scope, eventId };
    buildPacket(repo.data, { ...req, generatedAt: new Date().toISOString(), onProgress: (m) => alive && setProgress(m) }).then(
      (p) => {
        if (!alive) return;
        setPacket(p);
        setText(renderText(p));
      },
      (e: Error) => alive && setError(e),
    );
    return () => {
      alive = false;
    };
  }, [repo.data, sport, scope, eventId, start, end, trayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!sport) return <div className="page"><Notice tone="error" title="Unknown sport" /></div>;
  if (scope === 'CUSTOM' && !trayItems.length) {
    return (
      <div className="page">
        <Notice title={`Your research tray has no ${sport.label} items`}>Save teams, players, metrics, chart points or markets with “+ Tray”, then build the packet here.</Notice>
        <Link className="btn btn--ghost" to={routes.sport(sport.slug)}>Go to {sport.label}</Link>
      </div>
    );
  }
  const doCopy = async () => {
    const ok = await copyText(text);
    setCopied(ok ? 'ok' : 'fail');
    if (!ok) {
      setFull(true);
      setTimeout(() => {
        if (!pre.current) return;
        const r = document.createRange();
        r.selectNodeContents(pre.current);
        const s = window.getSelection();
        s?.removeAllRanges();
        s?.addRange(r);
      }, 50);
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${packet?.packet_id ?? 'sift-packet'}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const share = async () => {
    try {
      await navigator.share({ title: 'Sift handicap packet', text });
    } catch {
      /* cancelled */
    }
  };
  const lines = text.split('\n');
  const overBudget = packet && packet.budget.chars > packet.budget.max_chars;

  return (
    <div className="page packet">
      <header className="pagehead">
        <div className="eyebrow">Copy for ChatGPT · {sport.label} · {scope === 'CUSTOM' ? 'research tray' : scope.toLowerCase()}</div>
        <h1 className="h-display h-display--md">{packet?.scope.label ?? 'Building the handicap packet'}</h1>
        <p className="lede">
          One compact, self-contained packet: the {sport.label} handicap protocol, the evidence, every current market in scope, the model evidence,
          data quality and freshness, your research focus — and the rule that <b>projections are evidence, not recommendations</b>. Paste it into ChatGPT for the final handicap.
        </p>
      </header>

      {repo.error && <ErrorState error={repo.error} what={`${sport.label} data`} />}
      {error && <ErrorState error={error} what="the packet" />}
      {!packet && !error && (
        <div className="building" role="status" aria-live="polite">
          <span className="building__bar" />
          <span>{progress}…</span>
          <Skeleton lines={4} />
        </div>
      )}

      {packet && (
        <>
          <div className="copybar">
            <button type="button" className={`btn btn--copy${copied === 'ok' ? ' is-done' : ''}`} onClick={doCopy}>
              <Icon name={copied === 'ok' ? 'check' : 'copy'} size={18} />
              {copied === 'ok' ? `Copied ${text.length.toLocaleString()} characters` : 'COPY FOR CHATGPT'}
            </button>
            <a className="btn btn--ghost" href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">
              Open ChatGPT <Icon name="external" size={14} />
            </a>
            {'share' in navigator && <button type="button" className="btn btn--ghost" onClick={share}><Icon name="share" size={16} /> Share</button>}
            <button type="button" className="btn btn--ghost" onClick={download}><Icon name="download" size={16} /> .txt</button>
          </div>
          {copied === 'fail' && <Notice tone="warn" title="This browser blocked clipboard access">The packet text is selected below — use your device's Copy.</Notice>}

          <div className="pstats">
            <div><span className="summary__k">Characters</span><b className="num">{packet.budget.chars.toLocaleString()}</b><span className="muted"> / {packet.budget.max_chars.toLocaleString()} budget</span></div>
            <div><span className="summary__k">Events</span><b className="num">{packet.events.length}</b></div>
            <div><span className="summary__k">Evidence entities</span><b className="num">{packet.evidence.length}</b></div>
            <div><span className="summary__k">Markets</span><b className="num">{packet.markets.length}</b><span className="muted"> (all in scope)</span></div>
            <div><span className="summary__k">Model prices</span><b className="num">{packet.model_evidence.length}</b></div>
            <div><span className="summary__k">Packet</span><code>{packet.packet_id}</code></div>
          </div>
          <div className="chips">
            <FreshnessChip state={packet.quality.market_freshness as never} asOf={packet.markets.map((m) => m.captured_at).filter(Boolean).sort().pop() ?? null} label="markets" />
            <FreshnessChip state={packet.quality.model_freshness as never} asOf={packet.model_evidence.map((m) => m.generated_at).sort().pop() ?? null} component="model" label="model" />
            <span className="chip">protocol {packet.protocol.protocol_id} {packet.protocol.version}</span>
            <span className="chip">{packet.quality.research_only_items.length} research-only items</span>
          </div>
          {overBudget && (
            <Notice tone="warn" title={`Over the ${packet.budget.max_chars.toLocaleString()}-character budget`}>
              The contract never trims markets or model evidence, so a scope with many markets stays large ({packet.budget.truncated.join('; ')}). ChatGPT accepts it; for a tighter packet, narrow the scope (one game, or fewer team items in the tray).
            </Notice>
          )}

          {packet.user_focus.length > 0 && (
            <Stratum title="Your research focus" sub="Resolved against this publication. Unresolved items are listed in the packet as missing, never filled in.">
              <ul className="focuslist">
                {packet.user_focus.map((f) => (
                  <li key={f.item_id} className={f.resolved ? '' : 'is-unresolved'}>
                    <span className={`tray__kind tray__kind--${f.ref_kind.toLowerCase()}`}>{REF_WORD[f.ref_kind]}</span>
                    <span>{f.label ?? f.id}</span>
                    {!f.resolved && <span className="chip chip--warn">unresolved</span>}
                    {f.note && <span className="muted"> — {f.note}</span>}
                  </li>
                ))}
              </ul>
            </Stratum>
          )}

          {packet.quality.missing.length > 0 && (
            <Stratum title="Missing-data warnings" sub="Stated in the packet so the handicap reasons with the gap.">
              <ul className="lims">{packet.quality.missing.map((m) => <li key={m}>{m}</li>)}</ul>
            </Stratum>
          )}

          <Stratum title="Packet text" sub="Exactly what is copied." actions={<QualityBadge status="RESEARCH" />}>
            <pre className="packettext" ref={pre} tabIndex={0} aria-label="Packet text">
              {full ? text : lines.slice(0, 160).join('\n')}
            </pre>
            {!full && lines.length > 160 && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setFull(true)}>Show all {lines.length.toLocaleString()} lines</button>
            )}
          </Stratum>
        </>
      )}
    </div>
  );
}
