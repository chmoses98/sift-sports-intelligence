import { Link } from '../../routing';
import { routes } from '../nav/routes';
import { Icon } from './Icon';

/** The header's global search: one control on every primary screen, opening the search screen with the cursor in the field. */
export function SearchButton() {
  return <Link to={routes.search(true)} className="v3-iconbtn" aria-label="Search"><Icon name="search" size={24} /></Link>;
}
