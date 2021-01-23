import { expect } from 'chai';
import { spy } from 'chai';

import { getTestName } from '#/helpers/util';
import { MockedStorage } from '#/mock/MockedStorage';

import { NotificationsRepositoryImpl } from '@/background/repository/notifications/NotificationsRepositoryImpl';
import { basicAuthRemind } from '@/background/auth-remind/BasicAuthRemind';
import type {
	AuthRemindFunction,
	NotifyFunction,
} from '@/background/auth-remind/AuthRemindFunction';

describe(getTestName(__filename), () => {
	let notifyFn: NotifyFunction;
	let remindFn: AuthRemindFunction;

	beforeEach(() => {
		notifyFn = spy(() => Promise.resolve());
		remindFn = createAuthRemindFunction(notifyFn);
	});

	it('should call notify function', async () => {
		await remindFn();

		expect(notifyFn).to.have.called.exactly(1);
	});

	it('should not call notify funciton more than 3 times', async () => {
		await remindFn();
		await remindFn();
		await remindFn();
		await remindFn();

		expect(notifyFn).to.have.called.exactly(3);
	});
});

function createAuthRemindFunction(
	notifyFn: NotifyFunction
): AuthRemindFunction {
	const repository = new NotificationsRepositoryImpl(new MockedStorage());

	return () => basicAuthRemind(repository, notifyFn);
}
