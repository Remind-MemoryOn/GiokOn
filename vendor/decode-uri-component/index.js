// CommonJS port of decode-uri-component@0.5.1 (MIT, Sam Verschueren — see ./license).
// 기억온: 앱 번들에 실리는 expo-router → query-string@7 이 이 패키지를 `require()` 로 부른다.
// 원본 0.5.1(GHSA-qr28-fpjm-wq7f · GHSA-vcc3-ghjq-m6fr 수정판)은 ESM 전용이라 그대로 올리면 require 결과가
// 함수가 아니게 되어 딥링크 해석이 깨진다 → 수정판 알고리즘을 CommonJS 로만 바꿔 싣는다(로직 변경 없음).
// 루트 pnpm-workspace.yaml overrides 가 이 디렉터리로 연결한다. query-string 이 ESM 판으로 올라가면 지운다.
'use strict';

// Matches one or more consecutive percent-encoded bytes (e.g. `%C3%A5`).
const token = '%[a-f0-9]{2}';
const multiMatcher = new RegExp(`(${token})+`, 'gi');

const hexPair = /^[a-f\d]{2}$/i;

// Read a `%XX` sequence at `position`, returning the byte value and where to continue scanning.
function parsePercentByte(input, position) {
	if (input.codePointAt(position) !== 37 || position + 3 > input.length) {
		return;
	}

	const digits = input.slice(position + 1, position + 3);

	if (!hexPair.test(digits)) {
		return;
	}

	return {byte: Number.parseInt(digits, 16), next: position + 3};
}

/**
 * Return how many bytes a UTF-8 code point needs based on its lead byte.
 * Returns 0 for continuation bytes and other invalid lead bytes.
 */
function utf8SequenceLength(byte) {
	if (byte <= 0x7F) {
		return 1;
	}

	// Start at 0xC2 to exclude overlong 2-byte encodings (0xC0/0xC1).
	if (byte >= 0xC2 && byte <= 0xDF) {
		return 2;
	}

	if (byte >= 0xE0 && byte <= 0xEF) {
		return 3;
	}

	if (byte >= 0xF0 && byte <= 0xF4) {
		return 4;
	}

	return 0;
}

function isContinuationByte(byte) {
	return byte >= 0x80 && byte <= 0xBF;
}

/**
 * Decode as much of `input` as possible without throwing.
 *Scans left-to-right in O(n), decoding valid UTF-8 runs and leaving the rest literal.
 */
function decode(input) {
	try {
		return decodeURIComponent(input);
	} catch {
		let output = '';
		let position = 0;

		while (position < input.length) {
			if (input.codePointAt(position) !== 37) {
				output += input.charAt(position);
				position++;
				continue;
			}

			const firstByte = parsePercentByte(input, position);

			// `%` not followed by two hex digits (e.g. `%` or `%G`).
			if (!firstByte) {
				output += input.charAt(position);
				position++;
				continue;
			}

			const sequenceLength = utf8SequenceLength(firstByte.byte);

			// Continuation byte or invalid lead byte — emit one `%XX` literally.
			if (sequenceLength === 0) {
				const pair = input.slice(position, position + 6);

				// UTF-16 BOM byte pairs become two replacement characters.
				if (pair === '%FE%FF' || pair === '%FF%FE') {
					output += '\uFFFD\uFFFD';
					position += 6;
					continue;
				}

				output += input.slice(position, position + 3);
				position += 3;
				continue;
			}

			let end = firstByte.next;
			let validSequence = true;

			for (let index = 1; index < sequenceLength; index++) {
				const nextByte = parsePercentByte(input, end);

				if (!nextByte || !isContinuationByte(nextByte.byte)) {
					validSequence = false;
					break;
				}

				end = nextByte.next;
			}

			if (validSequence) {
				const encodedSequence = input.slice(position, end);

				try {
					output += decodeURIComponent(encodedSequence);
					position = end;
					continue;
				} catch {
					// Invalid UTF-8 despite correct structure — emit the first byte literally.
				}
			}

			// Missing continuation bytes or decode failure — emit the first byte literally.
			const literal = input.slice(position, position + 3);

			// A truncated `%C2` becomes a replacement character.
			output += literal === '%C2' ? '\uFFFD' : literal;
			position += 3;
		}

		return output;
	}
}

function customDecodeURIComponent(input) {
	// Decode each percent-encoded run in place in a single pass. Decoded output is never rescanned.
	return input.replace(multiMatcher, run => decode(run));
}

function decodeUriComponent(encodedURI) {
	if (typeof encodedURI !== 'string') {
		throw new TypeError(`Expected \`encodedURI\` to be of type \`string\`, got \`${typeof encodedURI}\``);
	}

	try {
		// Try the built in decoder first
		return decodeURIComponent(encodedURI);
	} catch {
		// Fallback to a more advanced decoder
		return customDecodeURIComponent(encodedURI);
	}
}

module.exports = decodeUriComponent;
module.exports.default = decodeUriComponent;
