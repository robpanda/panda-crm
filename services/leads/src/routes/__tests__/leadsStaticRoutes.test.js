import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const leadsRoutePath = path.resolve(__dirname, '../leads.js');

const getLeadsRouteSource = async () => readFile(leadsRoutePath, 'utf8');

test('comment departments route is declared before the generic /:id route', async () => {
  const source = await getLeadsRouteSource();
  const commentDepartmentsIndex = source.indexOf("router.get('/comment-departments'");
  const genericLeadRouteIndex = source.indexOf("router.get('/:id'");

  assert.notEqual(commentDepartmentsIndex, -1, 'expected /comment-departments route to exist');
  assert.notEqual(genericLeadRouteIndex, -1, 'expected generic /:id route to exist');
  assert.ok(
    commentDepartmentsIndex < genericLeadRouteIndex,
    'expected /comment-departments to be declared before /:id'
  );
});

test('reserved route guard protects comment-departments from /:id fallback', async () => {
  const source = await getLeadsRouteSource();

  assert.match(source, /const RESERVED_LEAD_ROUTE_IDS = new Set\(\[/);
  assert.match(source, /'comment-departments'/);
  assert.match(source, /router\.use\('\/:id', \(req, res, next\) => \{/);
  assert.match(source, /routeId === 'comment-departments'/);
  assert.match(source, /isReservedLeadRouteId\(routeId\)/);
});
