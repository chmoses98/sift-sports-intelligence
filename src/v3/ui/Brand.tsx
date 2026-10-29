import { Link } from '../../routing';
import { SiftMark } from './Icon';

export function Brand() {
  return (
    <Link to="/v3" className="v3-brand" aria-label="SIFT, Home">
      <SiftMark size={28} />
      <span className="v3-brand__w">SIFT</span>
    </Link>
  );
}
