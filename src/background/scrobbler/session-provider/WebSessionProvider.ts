import type { ScrobblerSession } from '@/background/account/ScrobblerSession';

/**
 * A basic web provider.
 *
 * Steps for requesting a session data:
 * 1. Get an auth URL and open this URL.
 * 3. Wait once a user signs in to the service.
 * 4. Request a session.
 */
export interface WebSessionProvider {
	getAuthUrl(): string;
	requestSession(): Promise<ScrobblerSession>;
}
