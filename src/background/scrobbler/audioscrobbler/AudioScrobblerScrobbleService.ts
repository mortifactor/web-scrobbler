import md5 from 'blueimp-md5';

import { LoveStatus } from '@/background/model/song/LoveStatus';
import { ScrobblerSession } from '@/background/account/ScrobblerSession';

import { hideStringInText } from '@/background/util/util';
import { createQueryString } from '@/common/util-browser';
import { fetchJson } from '@/background/util/fetch/FetchJson';

import type { TrackInfo } from '@/background/model/song/TrackInfo';
import type { ScrobbleService } from '@/background/scrobbler/ScrobbleService';
import type { AudioScrobblerAppInfo } from '@/background/scrobbler/audioscrobbler/AudioScrobblerAppInfo';
import type { TokenBasedSessionProvider } from '@/background/scrobbler/session-provider/TokenBasedSessionProvider';
import type { AudioScrobblerResponse } from './AudioScrobblerResponse';
import type { AudioScrobblerApiParams } from './AudioScrobblerApiParams';

export class AudioScrobblerScrobbleService
	implements ScrobbleService, TokenBasedSessionProvider {
	constructor(
		private session: ScrobblerSession,
		private readonly appInfo: AudioScrobblerAppInfo
	) {}

	/** TokenBasedSessionProvider implementation */

	async requestToken(): Promise<string> {
		const params = {
			method: 'auth.gettoken',
		};

		try {
			const response = await this.sendRequest({ method: 'GET' }, params, {
				signed: false,
			});
			return response.token;
		} catch (err) {
			throw new Error('Error acquiring a token');
		}
	}

	getAuthUrl(token: string): string {
		return `${this.appInfo.authUrl}?api_key=${this.appInfo.apiKey}&token=${token}`;
	}

	async requestSession(token: string): Promise<ScrobblerSession> {
		const params = { method: 'auth.getsession', token: token };
		const response = await this.sendRequest({ method: 'GET' }, params);
		this.processResponse(response);

		const { key, name } = response.session;
		return new ScrobblerSession(key, name);
	}

	/** ScrobbleService implementation */

	async sendNowPlayingRequest(trackInfo: TrackInfo): Promise<void> {
		const { artist, track, album, albumArtist, duration } = trackInfo;
		const params: AudioScrobblerApiParams = {
			track: track,
			artist: artist,
			method: 'track.updatenowplaying',
			sk: this.session.getId(),
		};

		if (album) {
			params.album = album;
		}

		if (albumArtist) {
			params.albumArtist = albumArtist;
		}

		if (duration) {
			params.duration = duration.toString();
		}

		return this.processResponse(
			await this.sendRequest({ method: 'POST' }, params)
		);
	}

	async sendScrobbleRequest(trackInfo: TrackInfo): Promise<void> {
		const { artist, track, album, albumArtist, timestamp } = trackInfo;
		const params: AudioScrobblerApiParams = {
			method: 'track.scrobble',
			'timestamp[0]': timestamp.toString(),
			'track[0]': track,
			'artist[0]': artist,
			sk: this.session.getId(),
		};

		if (album) {
			params['album[0]'] = album;
		}

		if (albumArtist) {
			params['albumArtist[0]'] = albumArtist;
		}

		return this.processResponse(
			await this.sendRequest({ method: 'POST' }, params)
		);
	}

	async sendLoveRequest(
		trackInfo: TrackInfo,
		loveStatus: LoveStatus
	): Promise<void> {
		const { artist, track } = trackInfo;
		const params = {
			track: track,
			artist: artist,
			method:
				loveStatus === LoveStatus.Loved ? 'track.love' : 'track.unlove',
			sk: this.session.getId(),
		};

		return this.processResponse(
			await this.sendRequest({ method: 'POST' }, params)
		);
	}

	/**
	 * Execute asynchronous request.
	 *
	 * API key will be added to params by default and all parameters will be
	 * encoded for use in query string internally.
	 * @param options Fetch options
	 * @param params Object of key => value url parameters
	 * @param flags Flags
	 * @param [flags.signed=true] Should the request be signed
	 *
	 * @return Parsed response
	 */
	protected async sendRequest(
		options: RequestInit,
		params: AudioScrobblerApiParams,
		{ signed = true } = {}
	): Promise<AudioScrobblerResponse> {
		const url = this.makeRequestUrl(params, signed);

		const { ok, data } = await fetchJson(url, options);

		const responseStr = JSON.stringify(data, null, 2);
		const debugMsg = hideUserData(data, responseStr);

		if (!ok) {
			// console.log(`${params.method} response:\n${debugMsg}`, 'error');
			throw new Error('Received error response');
		}

		console.log(`${params.method} response:\n${debugMsg}`);
		return data;
	}

	/**
	 * Process response and return service call result.
	 *
	 * @param responseData Response data
	 */
	private processResponse(responseData: AudioScrobblerResponse): void {
		if (responseData.error) {
			throw new Error('Error');
		}
	}

	/**
	 * Create URL of API request based on API params.
	 *
	 * @param params Object of key => value url parameters
	 * @param signed Should the request be signed
	 *
	 * @return URL of API request
	 */
	private makeRequestUrl(
		params: AudioScrobblerApiParams,
		signed: boolean
	): string {
		params.api_key = this.appInfo.apiKey;
		params.format = 'json';

		if (signed) {
			params.api_sig = this.generateSign(params);
		}

		const queryStr = createQueryString(params);
		return `${this.appInfo.apiUrl}?${queryStr}`;
	}

	/**
	 * Compute string for signing request.
	 * See http://www.last.fm/api/authspec#8
	 *
	 * @param params Parameters of API method
	 *
	 * @return Signed parameters
	 */
	private generateSign(params: AudioScrobblerApiParams): string {
		const keys = Object.keys(params).sort();
		let o = '';

		for (const key of keys) {
			if (['format', 'callback'].includes(key)) {
				continue;
			}

			o += key + params[key];
		}

		o += this.appInfo.apiSecret;

		return md5(o);
	}
}

/**
 * Hide sensitive user data from debug output.
 *
 * @param response Response data
 * @param text Debug message
 *
 * @return Text with hidden data
 */
function hideUserData(response: AudioScrobblerResponse, text: string) {
	let debugMsg = text;

	const sensitiveValues = [response.token];
	const session = response.session;
	if (session) {
		sensitiveValues.push(session.name);
		sensitiveValues.push(session.key);
	}

	for (const value of sensitiveValues) {
		debugMsg = hideStringInText(value, debugMsg);
	}

	return debugMsg;
}
