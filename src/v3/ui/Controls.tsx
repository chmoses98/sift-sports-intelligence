// The independent follow (star) and alert (bell) controls. Neither navigates; the star never subscribes to anything;
// the bell opens an explicit per-item opt-in sheet (no OS permission request is made by this build).
import { useAlerts, alertTopics, setAlertTopics, toggleFollow, toggleGroup, useFollows, type FollowKind } from '../state/prefs';
import { hasGroup } from '../model/groups';
import type { V3Game } from '../model/types';
import { Icon } from './Icon';
import { useSheet } from './Sheet';

/**
 * The star on a game card. Filled when the game is followed directly OR because one of its teams is (so the Following filter never shows a hollow
 * star on a card it lists). Tapping a filled star unfollows what made it filled: the game, and the followed team(s) of it.
 */
export function GameStar({ g, className }: { g: V3Game; className?: string }) {
  const f = useFollows();
  const direct = f.games.includes(g.key);
  const teams = [g.away, g.home].filter((t) => f.teams.includes(`${g.slug}:${t.id}`));
  const on = direct || teams.length > 0;
  const label = `${g.away.nick} at ${g.home.nick}`;
  return (
    <button
      type="button"
      className={`v3-iconbtn v3-star${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      aria-label={on ? `Unfollow ${label}${teams.length ? ` (following ${teams.map((t) => t.nick).join(' and ')})` : ''}` : `Follow ${label}`}
      onClick={(e) => {
        e.preventDefault(); e.stopPropagation();
        if (!on) { toggleFollow('games', g.key); return; }
        if (direct) toggleFollow('games', g.key);
        for (const t of teams) toggleFollow('teams', `${g.slug}:${t.id}`);
      }}
    >
      <Icon name="star" size={22} fill={on} />
    </button>
  );
}

export function FollowStar({ kind, id, label, className }: { kind: FollowKind; id: string; label: string; className?: string }) {
  const f = useFollows();
  const on = f[kind].includes(id);
  return (
    <button
      type="button"
      className={`v3-iconbtn v3-star${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      aria-label={`${on ? 'Unfollow' : 'Follow'} ${label}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFollow(kind, id); }}
    >
      <Icon name="star" size={22} fill={on} />
    </button>
  );
}

/** The star of a followed league, conference or all college sports (model/groups.ts keys). */
export function GroupStar({ groupKey, label, className }: { groupKey: string; label: string; className?: string }) {
  const f = useFollows();
  const on = hasGroup(f.groups, groupKey);
  return (
    <button
      type="button"
      className={`v3-iconbtn v3-star${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-pressed={on}
      aria-label={`${on ? 'Unfollow' : 'Follow'} ${label}`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleGroup(groupKey); }}
    >
      <Icon name="star" size={22} fill={on} />
    </button>
  );
}

function AlertPanel({ id, label }: { id: string; label: string }) {
  const a = useAlerts();
  const on = a[id] ?? [];
  const toggle = (t: string) => setAlertTopics(id, on.includes(t) ? on.filter((x) => x !== t) : [...on, t]);
  return (
    <div className="v3-alertpanel">
      <p className="v3-note">Alerts for <b>{label}</b> are off until you turn a topic on. Following does not turn alerts on.</p>
      <ul className="v3-list">
        {alertTopics.map((t) => (
          <li key={t}>
            <label className="v3-switchrow">
              <span>{t}</span>
              <input type="checkbox" role="switch" checked={on.includes(t)} onChange={() => toggle(t)} />
              <i aria-hidden="true" />
            </label>
          </li>
        ))}
      </ul>
      <p className="v3-note v3-note--dim">Alerts are not delivered yet: no notification, email or message will be sent. This only records your choice on this device, and it does not ask the phone for notification permission.</p>
    </div>
  );
}

export function AlertBell({ id, label, className }: { id: string; label: string; className?: string }) {
  const a = useAlerts();
  const sheet = useSheet();
  const on = (a[id] ?? []).length > 0;
  return (
    <button
      type="button"
      className={`v3-iconbtn v3-bell${on ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
      aria-label={`Alerts for ${label}: ${on ? 'on' : 'off'}. Configure`}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); sheet.open(`Alerts · ${label}`, <AlertPanel id={id} label={label} />); }}
    >
      <Icon name="bell" size={22} />
      {on && <i className="v3-bell__dot" aria-hidden="true" />}
    </button>
  );
}
