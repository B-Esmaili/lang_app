import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
	APP_ROLES,
	hasAnyAppRole,
	hasAppRole,
	isAppRole,
	parseAppRoles
} from '../src/lib/server/auth/roles';

test('exposes exactly the application roles', () => {
	assert.deepEqual(APP_ROLES, ['admin', 'teacher', 'student']);
});

test('rejects unknown and non-string roles', () => {
	assert.equal(isAppRole('owner'), false);
	assert.equal(isAppRole('user'), false);
	assert.equal(isAppRole(null), false);
});

test('parses Better Auth comma-separated roles without accepting unknown values', () => {
	assert.deepEqual(parseAppRoles('teacher, unknown, student'), ['teacher', 'student']);
	assert.deepEqual(parseAppRoles(undefined), []);
});

test('grants admin checks only when the stored role contains admin', () => {
	assert.equal(hasAppRole({ role: 'student' }, 'admin'), false);
	assert.equal(hasAppRole({ role: 'teacher' }, 'admin'), false);
	assert.equal(hasAppRole({ role: 'admin' }, 'admin'), true);
	assert.equal(hasAppRole(undefined, 'admin'), false);
});

test('allows teachers and administrators through course-author role checks', () => {
	assert.equal(hasAnyAppRole({ role: 'teacher' }, ['admin', 'teacher']), true);
	assert.equal(hasAnyAppRole({ role: 'admin' }, ['admin', 'teacher']), true);
	assert.equal(hasAnyAppRole({ role: 'student' }, ['admin', 'teacher']), false);
});
