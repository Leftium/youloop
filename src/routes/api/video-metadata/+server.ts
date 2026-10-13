import type { RequestHandler } from './$types';
import { videoMetadataResponse } from '#lib/server/video-metadata.ts';

export const GET: RequestHandler = ({ url }) =>
	videoMetadataResponse(
		url.searchParams.getAll('v').length === 1 ? url.searchParams.get('v') : null
	);
