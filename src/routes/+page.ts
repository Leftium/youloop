export const ssr = false;

export const load = ({ url }) => {
	const youtubeId = url.searchParams.get('v');
	const repeatA = Number(url.searchParams.get('a'));
	const repeatB = Number(url.searchParams.get('b'));

	return {
		youtubeId,
		repeatA,
		repeatB
	};
};
