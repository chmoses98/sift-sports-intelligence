// Team identity colors: brand presentation only (never data). Sift uses them as a thin accent —
// a stripe, a monogram tile — so Sift's own palette stays in charge.
const NFL: Record<string, [string, string]> = {
  ARI: ['#97233F', '#FFB612'], ATL: ['#A71930', '#A5ACAF'], BAL: ['#241773', '#9E7C0C'], BUF: ['#00338D', '#C60C30'],
  CAR: ['#0085CA', '#BFC0BF'], CHI: ['#0B162A', '#C83803'], CIN: ['#FB4F14', '#000000'], CLE: ['#311D00', '#FF3C00'],
  DAL: ['#003594', '#869397'], DEN: ['#FB4F14', '#002244'], DET: ['#0076B6', '#B0B7BC'], GB: ['#203731', '#FFB612'],
  HOU: ['#03202F', '#A71930'], IND: ['#002C5F', '#A2AAAD'], JAX: ['#006778', '#D7A22A'], KC: ['#E31837', '#FFB81C'],
  LV: ['#000000', '#A5ACAF'], LAC: ['#0080C6', '#FFC20E'], LA: ['#003594', '#FFA300'], LAR: ['#003594', '#FFA300'],
  MIA: ['#008E97', '#FC4C02'], MIN: ['#4F2683', '#FFC62F'], NE: ['#002244', '#C60C30'], NO: ['#D3BC8D', '#101820'],
  NYG: ['#0B2265', '#A71930'], NYJ: ['#125740', '#FFFFFF'], PHI: ['#004C54', '#A5ACAF'], PIT: ['#FFB612', '#101820'],
  SF: ['#AA0000', '#B3995D'], SEA: ['#002244', '#69BE28'], TB: ['#D50A0A', '#34302B'], TEN: ['#0C2340', '#4B92DB'],
  WAS: ['#5A1414', '#FFB612'],
};

export function teamColors(sport: string, abbr: string | null | undefined): [string, string] {
  if (sport === 'NFL' && abbr && NFL[abbr]) return NFL[abbr];
  return ['#1d2d52', '#3f5079'];
}

/** A team color that stays visible as a stripe on the near-black surface. */
export function teamAccent(sport: string, abbr: string | null | undefined): string {
  const [a, b] = teamColors(sport, abbr);
  return luminance(a) < 0.04 ? b : a;
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
