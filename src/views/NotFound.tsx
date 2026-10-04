import { Link } from 'react-router';
import { Notice } from '../components/ui';
import { routes } from '../lib/routes';

export function NotFound() {
  return (
    <div className="page">
      <Notice title="Nothing here">This address is not part of Sift. <Link to={routes.home()}>Go home</Link> or search above.</Notice>
    </div>
  );
}
