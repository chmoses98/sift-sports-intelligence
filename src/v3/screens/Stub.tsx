import { Brand } from '../ui/Brand';
export function Stub({ title }: { title: string }) {
  return <div className="v3-page"><header className="v3-top"><Brand /></header><div className="v3-state"><div><b>{title}</b>Not built yet.</div></div></div>;
}
