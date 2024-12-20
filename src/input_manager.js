import { Button } from '@nx.js/constants';

class GamepadEvents extends Array {
	THRESHOLD = 0.9;
	axisUp = false;
	axisDown = false;
	axisLeft = false;
	axisRight = false;
	constructor(numPlayers) {
		super(numPlayers);
		for (let i = 0; i < numPlayers; i++) {
			this[i] = new EventTarget();
			this[i].pressed = [];
		}
		this.#tick();
	}

	#tick = () => {
		requestAnimationFrame(this.#tick);
		const gamepads = navigator.getGamepads();
		for (let i = 0; i < this.length; i++) {
			const gamepad = gamepads[i];
			if (!gamepad) continue;
			const leftHorizontalAxis = gamepad.axes[0];
			const leftVerticalAxis = gamepad.axes[1];

			for (let j = 0; j < gamepad.buttons.length; j++) {
				const wasPressed = this[i].pressed[j];
				const pressed = gamepad.buttons[j].pressed;
				if (!wasPressed && pressed) {
					this[i].pressed[j] = true;
					this[i].dispatchEvent(new CustomEvent('buttondown', { detail: j }));
				} else if (wasPressed && !pressed) {
					this[i].pressed[j] = false;
					this[i].dispatchEvent(new CustomEvent('buttonup', { detail: j }));
				}
			}
			// ---------
			// first axis is X (-1 is all the way left & 1 is all the way right)
			// second axis is Y (-1 is all the way up & 1 is all the way down)
			// ---------

			// fake left button
			const wasLeftPressed = this.axisLeft;
			const isLeftPressed = leftHorizontalAxis < -this.THRESHOLD;
			if (isLeftPressed && !wasLeftPressed) {
				this[i].dispatchEvent(
					new CustomEvent('buttondown', { detail: Button.Left }),
				);
			}
			// fake right button
			const wasRightPressed = this.axisRight;
			const isRightPressed = leftHorizontalAxis > this.THRESHOLD;
			if (isRightPressed && !wasRightPressed) {
				this[i].dispatchEvent(
					new CustomEvent('buttondown', { detail: Button.Right }),
				);
			}

			// fake up button
			const wasUpPressed = this.axisUp;
			const isUpPressed = leftVerticalAxis < -this.THRESHOLD;
			if (isUpPressed && !wasUpPressed) {
				this[i].dispatchEvent(
					new CustomEvent('buttondown', { detail: Button.Up }),
				);
			}

			// fake down button
			const wasDownPressed = this.axisDown;
			const isDownPressed = leftVerticalAxis > this.THRESHOLD;
			if (isDownPressed && !wasDownPressed) {
				this[i].dispatchEvent(
					new CustomEvent('buttondown', { detail: Button.Down }),
				);
			}

			// Update button states
			this.axisUp = isUpPressed;
			this.axisDown = isDownPressed;
			this.axisLeft = isLeftPressed;
			this.axisRight = isRightPressed;
		}
	};
}

export class InputManager {
	constructor(gameManager) {
		this.gameManager = gameManager;
		this.listen();
	}
	listen() {
		// Respond to swipe events
		var touchStartClientX, touchStartClientY;
		screen.addEventListener('touchstart', (event) => {
			if (event.touches.length > 1) {
				return; // Ignore if touching with more than 1 finger
			}

			touchStartClientX = event.touches[0].clientX;
			touchStartClientY = event.touches[0].clientY;

			event.preventDefault();
		});

		screen.addEventListener('touchmove', (event) => {
			event.preventDefault();
		});

		screen.addEventListener('touchend', (event) => {
			if (event.touches.length > 0) {
				return; // Ignore if still touching with one or more fingers
			}

			var touchEndClientX = event.changedTouches[0].clientX;
			var touchEndClientY = event.changedTouches[0].clientY;

			var dx = touchEndClientX - touchStartClientX;
			var absDx = Math.abs(dx);

			var dy = touchEndClientY - touchStartClientY;
			var absDy = Math.abs(dy);

			if (Math.max(absDx, absDy) > 10) {
				// (right : left) : (down : up)
				this.gameManager.move(
					absDx > absDy ? (dx > 0 ? 1 : 3) : dy > 0 ? 2 : 0,
				);
			}
		});

		addEventListener('beforeunload', (event) => {
			if (this.gameManager.won && !this.gameManager.keepPlaying) {
				event.preventDefault();
				this.gameManager.continueGame();
			}
		});

		const gamepadEvents = new GamepadEvents(1);

		gamepadEvents[0].addEventListener('buttondown', (event) => {
			if (event.detail === Button.Left) {
				this.gameManager.move(3);
			} else if (event.detail === Button.Right) {
				this.gameManager.move(1);
			} else if (event.detail === Button.Up) {
				this.gameManager.move(0);
			} else if (event.detail === Button.Down) {
				this.gameManager.move(2);
			} else if (event.detail === Button.Minus) {
				this.gameManager.restart();
			}
		});
	}
}
