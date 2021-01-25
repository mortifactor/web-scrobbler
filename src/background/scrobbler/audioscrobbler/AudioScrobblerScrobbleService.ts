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
import { ExternalTrackInfoProvider } from '@/background/provider/ExternalTrackInfoProvider';
import { AudioScrobblerImage } from '@/background/scrobbler/audioscrobbler/AudioScrobblerImage';
import { TrackContextInfo } from '@/background/model/song/TrackContextInfo';
import { ExternalTrackInfo } from '@/background/provider/ExternalTrackInfo';
import { AudioScrobblerTrackInfo } from '@/background/scrobbler/audioscrobbler/AudioScrobblerTrackInfo';

export class AudioScrobblerScrobbleService
	implements
		ScrobbleService,
		TokenBasedSessionProvider,
		ExternalTrackInfoProvider {
	constructor(
		private session: ScrobblerSession,
		private readonly appInfo: AudioScrobblerAppInfo
	) {}

	/** SongInfoProvider implementation */

	async getExternalTrackInfo(
		trackInfo: TrackInfo
	): Promise<ExternalTrackInfo> {
		const audioScrobblerTrackInfo = await this.getAudioScrobblerTrackInfo(
			trackInfo
		);

		const audioScrobblerAbumInfo = audioScrobblerTrackInfo.album;
		const audioScrobblerArtistInfo = audioScrobblerTrackInfo.artist;

		const artist = audioScrobblerArtistInfo.name;
		const track = audioScrobblerTrackInfo.name;
		const duration =
			parseInt(audioScrobblerTrackInfo.duration) / 1000 || null;

		const artistUrl = audioScrobblerTrackInfo.url;
		const trackUrl = audioScrobblerTrackInfo.url;

		const result: ExternalTrackInfo = {
			artist,
			track,
			duration,

			artistUrl,
			trackUrl,
		};

		if (audioScrobblerAbumInfo) {
			result.album = audioScrobblerAbumInfo.title;
			result.albumUrl = audioScrobblerAbumInfo.url;
			result.albumMbId = audioScrobblerAbumInfo.mbid;

			if (Array.isArray(audioScrobblerAbumInfo.image)) {
				result.trackArtUrl = getAlbumArtFromResponse(
					audioScrobblerAbumInfo.image
				);
			}
		}

		return result;
	}

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

	async getTrackContextInfo(trackInfo: TrackInfo): Promise<TrackContextInfo> {
		const audioScrobblerTrackInfo = await this.getAudioScrobblerTrackInfo(
			trackInfo,
			this.session.getName()
		);

		return {
			userPlayCount: Number.parseInt(
				audioScrobblerTrackInfo.userplaycount
			),
			loveStatus:
				audioScrobblerTrackInfo.userloved === '1'
					? LoveStatus.Loved
					: LoveStatus.Unloved,
		};
	}

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

	private async getAudioScrobblerTrackInfo(
		trackInfo: TrackInfo,
		username?: string
	): Promise<Readonly<AudioScrobblerTrackInfo>> {
		const { artist, track, album } = trackInfo;

		const params: AudioScrobblerApiParams = {
			track,
			artist,
			method: 'track.getinfo',
		};

		if (album) {
			params.album = album;
		}

		if (username) {
			params.username = username;
		}

		const responseData = await this.sendRequest({ method: 'GET' }, params, {
			signed: false,
		});
		this.processResponse(responseData);

		return responseData.track;
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

const imageSizes = ['extralarge', 'large', 'medium'];

function getAlbumArtFromResponse(images: AudioScrobblerImage[]): string {
	/*
	 * Convert an array from response to an object.
	 * Format is the following: { size: "url", ... }.
	 */
	const imagesMap: Record<string, string> = images.reduce((result, image) => {
		result[image.size] = image['#text'];
		return result;
	}, {});

	for (const imageSize of imageSizes) {
		const url = imagesMap[imageSize];
		if (url) {
			return url;
		}
	}

	return null;
}
