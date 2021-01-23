import type { ScrobblerAuthenticator } from '@/background/authenticator/ScrobblerAuthenticator';
import type { ScrobblerSession } from '@/background/account/ScrobblerSession';
import type { TabOpener } from '@/background/authenticator/tab-opener/TabOpener';
import type { WebSessionProvider } from '@/background/scrobbler/service/WebSessionProvider';

export class WebAuthenticator implements ScrobblerAuthenticator {
	constructor(
		private tabOpener: TabOpener,
		private sessionProvider: WebSessionProvider
	) {}

	async requestSession(): Promise<ScrobblerSession> {
		const authUrl = this.sessionProvider.getAuthUrl();
		await this.tabOpener(authUrl);

		return this.sessionProvider.requestSession();
	}
}
