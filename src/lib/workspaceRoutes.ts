import type { To } from 'react-router';
export const SIFT2_ROOT='/design/sift2';
export const isSift2Path=(path:string)=>path===SIFT2_ROOT || path.startsWith(`${SIFT2_ROOT}/`);
/** Logical destination for shared navigation; the actual location retains its scope. */
export function workspacePath(path:string):string {
  if(!isSift2Path(path))return path;
  const local=path.slice(SIFT2_ROOT.length)||'/';
  return local==='/home' ? '/' : local==='/lab' ? '/explore' : local;
}
export function workspaceTarget(to:string,from:string):string;
export function workspaceTarget(to:To,from:string):To;
export function workspaceTarget(to:To,from:string):To {
  if(!isSift2Path(from))return to;
  const path=typeof to==='string'?to:to.pathname;
  if(!path?.startsWith('/') || path.startsWith('//') || /^\/design(?:\/|$)/.test(path))return to;
  const [pathname]=path.split(/[?#]/);const suffix=path.slice(pathname.length);
  const local=pathname==='/'?'/home':pathname==='/explore'?'/lab':pathname;
  const scoped=`${SIFT2_ROOT}${local}${suffix}`;
  return typeof to==='string'?scoped:{...to,pathname:scoped};
}
