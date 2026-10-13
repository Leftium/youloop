import assert from 'node:assert/strict';
import test from 'node:test';
import { editorTime, parseEditorTime } from '../src/lib/player/editor-time.ts';
import { parseEditorSource } from '../src/lib/player/editor-source.ts';

test('clock editing preserves signed fractional precision and marks whole-second approximations', () => {
	for (const [value, expected] of [
		[12.5, '0:12.5'],
		[-587.5, '-9:47.5'],
		[593.25, '9:53.25'],
		[-6.75, '-0:06.75'],
		[3600.001, '1:00:00.001'],
		[0.00000001, '0:00.00000001']
	]) {
		assert.equal(editorTime(value), expected);
		assert.equal(parseEditorTime(expected), value);
	}
	assert.equal(editorTime(12.5, false), '\u22480:13');
	assert.equal(editorTime(-6.75, false), '\u2248-0:07');
	assert.equal(parseEditorTime('-30.25'), -30.25);
	for (const text of ['', '-', '-0', '-0:00', '0:60', '1e3', 'abc', '1:2', '1.'])
		assert.equal(parseEditorTime(text), undefined);
});

test('source parser supports plain sources and imports YouLoop range/options with validation', () => {
	const videoId = 'Dxvrvfyicp0';
	for (const text of [
		videoId,
		`youtu.be/${videoId}`,
		`www.youtube.com/watch?v=${videoId}`,
		`https://youtu.be/${videoId}?t=10`,
		`https://www.youtube.com/watch?v=${videoId}`,
		`https://m.youtube.com/shorts/${videoId}`,
		`https://www.youtube-nocookie.com/embed/${videoId}`
	])
		assert.deepEqual(parseEditorSource(text), { videoId });
	for (const text of [
		`https://youloop.app/${videoId}/-30.25~-5.5?once&mute&speed=0.5`,
		`/?v=${videoId}&t=-30.25~-5.5&once&mute&speed=0.5`
	])
		assert.deepEqual(parseEditorSource(text), {
			videoId,
			clip: { videoId, start: -30.25, end: -5.5, once: true, mute: true, speed: 0.5 }
		});
	for (const text of [
		'bad',
		'https://youtube.com/watch?v=bad',
		'javascript:alert(1)',
		`/${videoId}/bad`,
		`/${videoId}/30~5`
	])
		assert.equal(parseEditorSource(text), undefined);
});
