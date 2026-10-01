// @ts-expect-error Bun supplies this built-in module when the test runs.
import { expect, mock, test } from 'bun:test';

const removeUser = mock(async () => ({ success: true }));

mock.module('$lib/server/auth', () => ({
	auth: {
		api: {
			getSession: async () => ({
				session: { id: 'session.admin' },
				user: { id: 'user.admin', role: 'admin' }
			}),
			getUser: async () => ({ id: 'user.teacher', role: 'teacher' }),
			removeUser
		}
	}
}));

mock.module('$lib/server/db', () => ({
	db: {
		select: () => ({
			from: () => ({
				where: async () => [{ total: 1 }]
			})
		})
	}
}));

const { deleteManagedUser } = await import('../src/lib/server/auth/admin-users');

test('refuses to delete a user who owns course content', async () => {
	removeUser.mockClear();

	await expect(deleteManagedUser(new Headers(), 'user.teacher')).rejects.toEqual(
		expect.objectContaining({
			name: 'AdminUserError',
			status: 409,
			message: expect.stringContaining('owns courses')
		})
	);
	expect(removeUser).not.toHaveBeenCalled();
});
