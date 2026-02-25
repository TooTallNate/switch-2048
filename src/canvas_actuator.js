import { ease, easeIn, easeInOut } from './easings';

const bgColor = '#faf8ef';
const gridContainerColor = '#bbada0';

const fontColorDark = '#776e65';
const fontColorLight = '#f9f6f2';
const fontColorScore = '#eee4da';

const emptyTileColor = 'rgba(238, 228, 218, 0.35)';

const tileColors = {
	2: '#eee4da',
	4: '#eee1c9',
	8: '#f3b27a',
	16: '#f69664',
	32: '#f77c5f',
	64: '#f75f3b',
	128: '#edd073',
	256: '#edcc62',
	512: '#edc950',
	1024: '#edc53f',
	2048: '#edc22e',
};

// After 2048, this color is used
const tileColorMax = '#3c3a33';

// The font size to use in the tile,
// based on the number of digits
const tileLengthFontSizes = {
	1: 60,
	2: 60,
	3: 52,
	4: 44,
	5: 36,
};

const tileMoveDuration = 100;
const scoreAnimationDuration = 600;
const messageFadeAnimationDuration = 800;

export class CanvasActuator {
	constructor() {
		this.lastUpdateAt = 0;
		this.continueGameAt = 0;

		/**
		 * @type CanvasRenderingContext2D
		 */
		this.ctx = screen.getContext('2d');

		this.ctx.textAlign = 'center';
		this.ctx.textBaseline = 'middle';

		// Draw background
		this.ctx.fillStyle = bgColor;
		this.ctx.fillRect(0, 0, this.ctx.canvas.width, this.ctx.canvas.height);

		// Draw instructions text
		const instructionsTextX = 170;
		let instructionsTextY = 100;
		this.ctx.fillStyle = fontColorDark;
		this.ctx.font = 'bold 80px "Clear Sans"';
		this.ctx.fillText('2048', instructionsTextX, instructionsTextY);

		instructionsTextY += 100;
		this.ctx.font = 'bold 30px "Clear Sans"';
		this.ctx.fillText('HOW TO PLAY:', instructionsTextX, instructionsTextY);

		instructionsTextY += 50;
		this.ctx.font = '24px "Clear Sans"';
		this.ctx.fillText(
			'Use the D-pad, swipe the',
			instructionsTextX,
			instructionsTextY,
		);

		instructionsTextY += 30;
		this.ctx.fillText(
			'screen or use the sticks to',
			instructionsTextX,
			instructionsTextY,
		);

		instructionsTextY += 30;
		this.ctx.fillText('move the tiles.', instructionsTextX, instructionsTextY);
		instructionsTextY += 60;
		this.ctx.fillText(
			'Tiles with the same',
			instructionsTextX,
			instructionsTextY,
		);
		instructionsTextY += 30;
		this.ctx.fillText(
			'number merge into one',
			instructionsTextX,
			instructionsTextY,
		);
		instructionsTextY += 30;
		this.ctx.fillText('when they touch.', instructionsTextX, instructionsTextY);

		instructionsTextY += 60;
		this.ctx.fillText(
			'Add them up to reach 2048!',
			instructionsTextX,
			instructionsTextY,
		);

		this.gridSize = 600;
		this.gridSpacing = 18;
		this.tileSize = (this.gridSize - this.gridSpacing * (4 + 1)) / 4;
		this.gridX = this.ctx.canvas.width / 2 - this.gridSize / 2;
		this.gridY = this.ctx.canvas.height / 2 - this.gridSize / 2;
		this.sidebarWidth = (this.ctx.canvas.width - this.gridSize) / 2;
		this.scoreBoxWidth = this.sidebarWidth * 0.5;
		this.scoreBoxHeight = 100;

		this.score = 0;
		this.scoreAnimations = new Map();

		// Track whether we already vibrated for the current move
		this.hasVibratedForMove = false;

		// Track whether an animation is currently running
		this.animationFrameId = 0;

		// --- Offscreen canvas: static grid background (grid container + 16 empty cells) ---
		this.gridBgCanvas = new OffscreenCanvas(this.gridSize, this.gridSize);
		this._renderGridBackground();

		// --- Offscreen canvas cache for individual tiles (keyed by tile value) ---
		this.tileCacheMap = new Map();
		this._warmTileCache();

		// Bind the unified render loop
		this._animationLoop = this._animationLoop.bind(this);
	}

	/**
	 * Pre-render the static grid background (container + empty cells) to an offscreen canvas.
	 * Called once during construction.
	 */
	_renderGridBackground() {
		const offCtx = this.gridBgCanvas.getContext('2d');
		offCtx.textAlign = 'center';
		offCtx.textBaseline = 'middle';

		// Grid container (coordinates relative to offscreen canvas: 0,0)
		offCtx.beginPath();
		offCtx.roundRect(0, 0, this.gridSize, this.gridSize, 8);
		offCtx.fillStyle = gridContainerColor;
		offCtx.fill();

		// Empty cells
		for (let x = 0; x < 4; x++) {
			for (let y = 0; y < 4; y++) {
				const cx =
					this.gridSpacing + x * (this.tileSize + this.gridSpacing);
				const cy =
					this.gridSpacing + y * (this.tileSize + this.gridSpacing);
				offCtx.beginPath();
				offCtx.roundRect(cx, cy, this.tileSize, this.tileSize, 6);
				offCtx.fillStyle = emptyTileColor;
				offCtx.fill();
			}
		}
	}

	/**
	 * Pre-render a tile with the given value to an offscreen canvas and cache it.
	 * Returns the cached OffscreenCanvas.
	 */
	_getCachedTile(value) {
		let cached = this.tileCacheMap.get(value);
		if (cached) return cached;

		const size = this.tileSize;
		const canvas = new OffscreenCanvas(size, size);
		const offCtx = canvas.getContext('2d');
		offCtx.textAlign = 'center';
		offCtx.textBaseline = 'middle';

		// Tile background
		const fillStyle = tileColors[value] || tileColorMax;
		offCtx.beginPath();
		offCtx.roundRect(0, 0, size, size, 6);
		offCtx.fillStyle = fillStyle;
		offCtx.fill();

		// Tile number text
		const val = String(value);
		const fontSize = tileLengthFontSizes[val.length];
		offCtx.font = `bold ${fontSize}px "Clear Sans"`;
		offCtx.fillStyle = value > 4 ? fontColorLight : fontColorDark;
		offCtx.fillText(val, size / 2, size / 2);

		this.tileCacheMap.set(value, canvas);
		return canvas;
	}

	/**
	 * Pre-warm the tile cache for common values so the first render is fast.
	 */
	_warmTileCache() {
		for (const value of [2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048]) {
			this._getCachedTile(value);
		}
	}

	actuate(grid, metadata) {
		// If an animation was in progress, instantly finish it by drawing
		// the previous state at t=1 (final positions). This prevents
		// the visual "teleporting" stutter when rapid inputs arrive.
		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
			this.animationFrameId = 0;
			// Draw previous frame's grid at final state if we have one
			if (this._prevGrid) {
				this._drawGridAtTime(this._prevGrid, this._prevMetadata, tileMoveDuration);
			}
		}

		this.lastUpdateAt = performance.now();
		this.hasVibratedForMove = false;

		// Store current grid/metadata for the animation loop and for
		// instant-finish on next rapid input
		this._prevGrid = grid;
		this._prevMetadata = metadata;

		this.updateScore(metadata.score);
		this.drawBestScore(metadata.bestScore);

		// Kick off the unified animation loop
		this._animationLoop();
	}

	/**
	 * Unified animation loop. Drives both the grid tile animation
	 * and the floating score animation in a single rAF callback.
	 */
	_animationLoop() {
		const now = performance.now();
		const delta = now - this.lastUpdateAt;
		const grid = this._prevGrid;
		const metadata = this._prevMetadata;

		// --- Draw grid + tiles ---
		this._drawGridAtTime(grid, metadata, delta);

		// --- Draw score animations ---
		this._drawScoreAnimations(now);

		// Determine if we need another frame
		let animationDuration = tileMoveDuration;
		if (metadata.terminated && this.continueGameAt === 0) {
			animationDuration = messageFadeAnimationDuration;
		}

		const gridAnimating = delta < animationDuration;
		const scoreAnimating = this.scoreAnimations.size > 0;

		if (gridAnimating || scoreAnimating) {
			this.animationFrameId = requestAnimationFrame(this._animationLoop);
		} else {
			this.animationFrameId = 0;
		}
	}

	/**
	 * Draw the grid and all tiles at a specific point in the animation timeline.
	 */
	_drawGridAtTime(grid, metadata, delta) {
		const { ctx } = this;

		// Blit the cached grid background (container + empty cells) in one call
		ctx.drawImage(this.gridBgCanvas, this.gridX, this.gridY);

		// Draw active cells
		let shouldVibrate = false;
		for (let x = 0; x < grid.size; x++) {
			for (let y = 0; y < grid.size; y++) {
				const tile = grid.cells[x][y];
				if (tile) {
					if (tile.mergedFrom) {
						shouldVibrate = true;
					}
					this.addTile(tile, delta);
				}
			}
		}

		// Vibrate once per move, not once per frame
		if (shouldVibrate && !this.hasVibratedForMove) {
			this.hasVibratedForMove = true;
			navigator.vibrate(100);
		}

		// Game over / win message overlay
		if (metadata.terminated && this.continueGameAt === 0) {
			if (metadata.over) {
				this.message(false, delta);
			} else if (metadata.won) {
				this.message(true, delta);
			}
		}
	}

	// Continues the game (both restart and keep playing)
	continueGame() {
		this.continueGameAt = performance.now();
	}

	tilePosition(x, y) {
		return {
			x: this.gridX + this.gridSpacing + x * (this.tileSize + this.gridSpacing),
			y: this.gridY + this.gridSpacing + y * (this.tileSize + this.gridSpacing),
		};
	}

	addTile(tile, delta) {
		if (tile.previousPosition) {
			// Render the (potentially) moving tile at its current location
			const oldPos = this.tilePosition(
				tile.previousPosition.x,
				tile.previousPosition.y,
			);
			const tilePos = this.tilePosition(tile.x, tile.y);
			const t = Math.min(delta / tileMoveDuration, 1);
			const e = easeInOut(t);
			const dx = tilePos.x - oldPos.x;
			const dy = tilePos.y - oldPos.y;
			const x = oldPos.x + dx * e;
			const y = oldPos.y + dy * e;
			this.drawTile(tile, x, y);
		} else if (tile.mergedFrom) {
			const t = Math.min(delta / tileMoveDuration, 1);
			if (t === 1) {
				// Movement animation completed, so render the merged cell
				// TODO: make it "pop"
				const tilePos = this.tilePosition(tile.x, tile.y);
				this.drawTile(tile, tilePos.x, tilePos.y);
			} else {
				// Render the tiles that merged
				for (const mergedTile of tile.mergedFrom) {
					this.addTile(mergedTile, delta);
				}
			}
		} else {
			// TODO: "appear" animation, delayed by 100ms
			const tilePos = this.tilePosition(tile.x, tile.y);
			this.drawTile(tile, tilePos.x, tilePos.y);
		}
	}

	drawTile(tile, x, y) {
		if (tile?.value) {
			// Use cached offscreen tile canvas -- single drawImage instead of
			// roundRect + fill + font change + fillText
			const cached = this._getCachedTile(tile.value);
			this.ctx.drawImage(cached, x, y);
		} else {
			// Empty tile (shouldn't normally be called since grid bg handles these,
			// but kept as a safety fallback)
			const { ctx } = this;
			ctx.beginPath();
			ctx.roundRect(x, y, this.tileSize, this.tileSize, 6);
			ctx.fillStyle = emptyTileColor;
			ctx.fill();
		}
	}

	updateScore(score) {
		const difference = score - this.score;
		this.score = score;
		if (difference > 0) {
			this.scoreAnimations.set(performance.now(), difference);
		}
		// Draw the score box immediately (the floating animations are
		// handled by the unified animation loop)
		this._drawScoreBox();
	}

	/**
	 * Draw the static score box (background + "SCORE" label + current score number).
	 */
	_drawScoreBox() {
		const { ctx } = this;
		const scoreWidth = this.scoreBoxWidth;
		const scoreHeight = this.scoreBoxHeight;
		const scoreX =
			ctx.canvas.width - this.sidebarWidth + this.scoreBoxWidth / 2;
		const scoreY = 80;

		ctx.fillStyle = bgColor;
		ctx.fillRect(scoreX, scoreY - 80, scoreWidth, scoreHeight + 80);

		ctx.beginPath();
		ctx.fillStyle = '#bbada0';
		ctx.roundRect(scoreX, scoreY, scoreWidth, scoreHeight, 6);
		ctx.fill();

		const scoreTextX = scoreX + scoreWidth / 2;

		ctx.fillStyle = fontColorScore;
		ctx.font = 'bold 24px "Clear Sans"';
		ctx.fillText('SCORE', scoreTextX, scoreY + 30);

		ctx.fillStyle = fontColorLight;
		ctx.font = 'bold 36px "Clear Sans"';
		const scoreStr = String(this.score);
		const scoreTextY = 68 + scoreY;
		ctx.fillText(scoreStr, scoreTextX, scoreTextY);
	}

	/**
	 * Draw floating "+N" score animations. Called from the unified animation loop.
	 *
	 * The floaters start inside the score box and drift upward, so we must
	 * redraw the score box first to clear any ghosted text from the previous
	 * frame before painting the new positions.
	 */
	_drawScoreAnimations(now) {
		if (this.scoreAnimations.size === 0) return;

		const { ctx } = this;
		const scoreWidth = this.scoreBoxWidth;
		const scoreHeight = this.scoreBoxHeight;
		const scoreX =
			ctx.canvas.width - this.sidebarWidth + this.scoreBoxWidth / 2;
		const scoreY = 80;
		const scoreTextX = scoreX + scoreWidth / 2;
		const scoreTextY = 68 + scoreY;

		// Clear the full region the floaters can occupy (above + over the score box)
		// then redraw the score box so ghosted "+N" text from previous frames is erased.
		ctx.fillStyle = bgColor;
		ctx.fillRect(scoreX, scoreY - 80, scoreWidth, scoreHeight + 80);
		this._drawScoreBox();

		ctx.font = 'bold 36px "Clear Sans"';

		for (const [startedAt, difference] of this.scoreAnimations.entries()) {
			const diff = now - startedAt;
			const t = Math.min(diff / scoreAnimationDuration, 1);
			const e = easeIn(t);
			ctx.fillStyle = `rgba(119, 110, 101, ${1 - e})`;
			const scoreDiff = `+${difference}`;
			const y = scoreTextY - scoreHeight * e;
			ctx.fillText(scoreDiff, scoreTextX, y);
			if (t === 1) {
				this.scoreAnimations.delete(startedAt);
			}
		}
	}

	drawBestScore(bestScore) {
		const { ctx } = this;
		const scoreWidth = this.scoreBoxWidth;
		const scoreHeight = this.scoreBoxHeight;
		const scoreX =
			ctx.canvas.width - this.sidebarWidth + this.scoreBoxWidth / 2;
		const scoreY = 220;

		ctx.fillStyle = bgColor;
		ctx.fillRect(scoreX, scoreY, scoreWidth, scoreHeight);

		ctx.beginPath();
		ctx.fillStyle = '#bbada0';
		ctx.roundRect(scoreX, scoreY, scoreWidth, scoreHeight, 6);
		ctx.fill();

		const scoreTextX = scoreX + scoreWidth / 2;

		ctx.fillStyle = fontColorScore;
		ctx.font = 'bold 24px "Clear Sans"';
		ctx.fillText('BEST', scoreTextX, scoreY + 30);

		ctx.fillStyle = fontColorLight;
		ctx.font = 'bold 36px "Clear Sans"';
		const scoreStr = String(bestScore);
		const scoreTextY = 68 + scoreY;
		ctx.fillText(scoreStr, scoreTextX, scoreTextY);
	}

	message(won, delta) {
		const t = Math.min(delta / messageFadeAnimationDuration, 1);
		const e = ease(t);

		this.ctx.beginPath();
		this.ctx.fillStyle = `rgba(255, 255, 255, ${e / 2})`;
		this.ctx.roundRect(this.gridX, this.gridY, this.gridSize, this.gridSize, 8);
		this.ctx.fill();

		this.ctx.font = 'bold 64px "Clear Sans"';
		this.ctx.fillStyle = `rgba(119, 110, 101, ${e})`;
		const message = won ? 'You win!' : 'Game over!';
		const x = this.gridX + this.gridSize / 2;
		const y = this.gridY + this.gridSize / 2;
		this.ctx.fillText(message, x, y);
	}
}
