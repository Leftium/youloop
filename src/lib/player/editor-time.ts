import { decimal, subtractSeconds } from '../share-url.ts';

/** Clock text retains decimal seconds, including precision finer than tenths. */
export function editorTime(value: number, precise = true, decimalPlaces?: number): string {
	const rounded = !precise
		? Math.round(value)
		: decimalPlaces === undefined
			? value
			: Math.round(value * 10 ** decimalPlaces) / 10 ** decimalPlaces;
	const magnitude = Math.abs(rounded);
	const seconds = magnitude % 60;
	const whole = Math.floor(magnitude);
	const fraction = subtractSeconds(magnitude, whole);
	const tail = fraction ? decimal(fraction).slice(1) : '';
	const hours = Math.floor(whole / 3600);
	const minutes = Math.floor(whole / 60) % 60;
	const clock = `${hours ? `${hours}:${String(minutes).padStart(2, '0')}` : Math.floor(whole / 60)}:${String(Math.floor(seconds)).padStart(2, '0')}${tail}`;
	return `${value < 0 ? '-' : ''}${clock}`;
}

/** Negative zero is intentionally invalid: use the explicit open-end action. */
export function parseEditorTime(text: string): number | undefined {
	if (!/^-?\d+(?::[0-5]\d){0,2}(?:\.\d+)?$/.test(text.trim())) return undefined;
	const negative = text.trim().startsWith('-');
	const parts = text.trim().replace(/^-/, '').split(':');
	const value = parts.reduce((total, part) => total * 60 + Number(part), 0);
	if (!Number.isFinite(value) || (negative && value === 0)) return undefined;
	return negative ? -value : value;
}
