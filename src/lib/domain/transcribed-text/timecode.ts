/**
 * A media position stored as integer milliseconds. Provider and browser APIs
 * use seconds, but the rest of the application never needs to work with their
 * floating-point representation directly.
 */
export class Timecode {
	private constructor(private readonly milliseconds: number) {}

	static fromMilliseconds(value: number): Timecode {
		if (!Number.isFinite(value) || value < 0)
			throw new RangeError('Timecode must be non-negative.');
		return new Timecode(Math.round(value));
	}

	static fromSeconds(value: number): Timecode {
		return Timecode.fromMilliseconds(value * 1_000);
	}

	toMilliseconds(): number {
		return this.milliseconds;
	}

	toSeconds(): number {
		return this.milliseconds / 1_000;
	}

	compare(other: Timecode): number {
		return this.milliseconds - other.milliseconds;
	}
}
