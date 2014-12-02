(function() {
	'use strict';

	angular.module('ng-createjs.services', [])

	.constant('createjsConfig', {
		inCordova: 'cordova' in window,
		soundMuted: false
	})

	.factory('soundManager', ['$timeout', function($timeout) {
		function SoundManager() {
			this._pendingSounds = {fx: [], bg: null};
			this._backgroundSoundInstance = null;
			this._registeredSounds = {};

			createjs.Sound.addEventListener('fileload', createjs.proxy(this._soundLoadHandler, this));
		}

		SoundManager.prototype._soundLoadHandler = function(e) {
			var soundInstance;
			var pendingSounds = this._pendingSounds;

			if (pendingSounds.fx.length) {
				var soundIndex = -1;

				for (var i = 0, len = pendingSounds.fx.length; i < len; i++) {
					if (pendingSounds.fx[i].src === e.src) {
						soundIndex = i;
						break;
					}
				}

				if (soundIndex >= 0) {
					var soundData = pendingSounds.fx.splice(soundIndex, 1)[0];
					var volumeValue = 1;

					if (soundData.options && soundData.options.volume) {
						volumeValue = soundData.options.volume;
					}

					soundInstance = this._registeredSounds[e.src] = createjs.Sound.play(e.src, 0, 0, 0, 0, volumeValue);
				}
			}

			if (!soundInstance && pendingSounds.bg === e.src) {
				soundInstance = createjs.Sound.play(e.src, createjs.Sound.INTERRUPT_EARLY, 0, 0, -1);
				soundInstance.setVolume(0.2);

				if (soundInstance.playState === createjs.Sound.PLAY_FAILED) {
					// Something went wrong. Most probably it's due to a lack of available channels. Play the sound manually.
					soundInstance.play();
				}

				this._backgroundSoundInstance = soundInstance;
				pendingSounds.bg = null;
			}
		};

		/**
		 * Plays an fx sound once
		 * @param {String} src
		 * @param {Object} sound options
		 */
		SoundManager.prototype.playFX = function(src, options) {
			var self = this;
			var details = true;

			this._pendingSounds.fx.push({src: src, options: options});

			this._registeredSounds[src] = true;

			if (this._registeredSounds[src]) {
				$timeout(function() {
					// We need this outside $apply phases or it will block drawing.
					self._soundLoadHandler({src: src});
				}, 0, false);
			} else {
				details = createjs.Sound.registerSound(src);
			}

			return details !== false;
		};

		/**
		 * Plays a background sound. There can be only one background sound at a time.
		 * @param {String} src
		 */
		SoundManager.prototype.playBackground = function(src) {
			this._pendingSounds.bg = src;

			// TODO: Unregister previous background sound if it's not an fx sound
			var details = createjs.Sound.registerSound(src);

			if (details === true) {
				// The sound was already registered before
				this._soundLoadHandler({src: src});
			}

			return details !== false;
		};

		SoundManager.prototype.stopBackground = function() {
			this._pendingSounds.bg = null;

			if (this._backgroundSoundInstance) {
				// TODO: Complete
			}
		};

		return new SoundManager();
	}]);
}) ();