import { lazy } from 'react';
import { Route } from 'react-router-dom';
import { renderLazyRoute } from '../../routes/shared';

const Search = lazy(() => import('../../pages/Search'));

export function renderSearchRoutes() {
  return <Route path="search" element={renderLazyRoute(Search, 'Loading search...')} />;
}
