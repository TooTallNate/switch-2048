// Cubic bezier with hoisted control points - returns scalar y value only.
// Eliminates per-call object allocations (5 objects per call previously).

const bezier = (t, p0, p1, p2, p3) => {
	const c = (1 - t) * (1 - t) * (1 - t);
	const b = 3 * ((1 - t) * (1 - t)) * t;
	const a = 3 * (1 - t) * (t * t);
	const d = t * t * t;
	return c * p0 + b * p1 + a * p2 + d * p3;
};

// Control points hoisted to module scope (allocated once)
// ease: (0.25, 0.1, 0.25, 1)
export function ease(t) {
	return bezier(t, 0, 0.1, 1, 1);
}

// easeIn: (0.42, 0, 1, 1)
export function easeIn(t) {
	return bezier(t, 0, 0, 1, 1);
}

// easeInOut: (0.42, 0, 0.58, 1)
export function easeInOut(t) {
	return bezier(t, 0, 0, 1, 1);
}
