import { Route } from 'react-router-dom';
import Search from '../../pages/Search';

export function renderSearchRoutes() {
  return <Route path="search" element={<Search />} />;
}
