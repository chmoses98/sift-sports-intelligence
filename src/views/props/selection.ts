/** Focus an existing published prop; never replace an unknown player/stat with unrelated research. */
export function selectProp<T extends {id:string;playerId:string;def:{stat:string}}>(rows:T[],params:URLSearchParams,fallback:T|null):T|null{
  const id=params.get('prop'),player=params.get('player'),stat=params.get('stat');
  if(id)return rows.find(r=>r.id===id)??null;
  if(player||stat)return rows.find(r=>(!player||r.playerId===player)&&(!stat||r.def.stat===stat))??null;
  return fallback;
}
