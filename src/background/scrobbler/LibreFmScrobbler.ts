import { Scrobbler } from '@/background/scrobbler/Scrobbler';
import { ScrobblerId } from '@/background/scrobbler/ScrobblerId';

import { LibreFmScrobbleService } from '@/background/scrobbler/service/audioscrobbler/LibreFmScrobbleService';
import { LibreFmAppInfo } from '@/background/scrobbler/service/audioscrobbler/LibreFmAppInfo';

import type { ScrobbleService } from '@/background/scrobbler/service/ScrobbleService';

export class LibreFmScrobbler extends Scrobbler {
	getId(): ScrobblerId {
		return ScrobblerId.LibreFm;
	}

	getLabel(): string {
		return 'Libre.fm';
	}

	getBaseProfileUrl(): string {
		return 'https://libre.fm/user';
	}

	createScrobbleService(): ScrobbleService {
		return new LibreFmScrobbleService(this.session, LibreFmAppInfo);
	}
}
