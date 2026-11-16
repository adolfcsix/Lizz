import test from 'node:test';
import assert from 'node:assert/strict';
import { navigation } from '../../shared/role-navigation.js';
import { groupedNavigation } from '../../shared/navigation-groups.js';
for (const role of ['MANAGER', 'STAFF', 'LECTURER', 'STUDENT']) {
  test(`Menu groups ${role}: each permitted route appears exactly once`, () => {
    const pages = navigation.filter(page => page.roles.includes(role) && page.id !== 'notifications');
    const groups = groupedNavigation(pages);
    const ids = groups.flatMap(group => group.items.map(page => page.id));
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([...ids].sort(), pages.map(page => page.id).sort());
    assert.ok(groups.every(group => group.items.length));
    if (role !== 'MANAGER') assert.ok(!ids.includes('accounts'));
  });
}
