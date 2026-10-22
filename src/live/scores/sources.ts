// How a provider id is named on screen. The attribution line is the provider's own condition of use, shown wherever its data is.
export const SOURCES: Record<string, { label: string; long: string; terms: string }> = {
  espn: { label: 'ESPN', long: 'ESPN public scoreboard (unofficial)', terms: 'https://disneytermsofuse.com/' },
};
export const sourceLabel = (id: string | null | undefined) => (id ? SOURCES[id]?.label ?? id : 'the score feed');
