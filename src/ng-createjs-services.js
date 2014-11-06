(function() {
	'use strict';

	angular.module('ng-createjs.services', [])

	.constant('createjsConfig', {
		inCordova: 'cordova' in window,
		soundMuted: false
	})

	.factory('soundManager', function() {
		function SoundManager() {
			this._pendingSounds = {fx: [], bg: null};
			this._backgroundSoundInstance = null;

			createjs.Sound.addEventListener('fileload', createjs.proxy(this._soundLoadHandler, this));
		}

		SoundManager.prototype._soundLoadHandler = function(e) {
			var soundInstance;
			var pendingSounds = this._pendingSounds;

			if (pendingSounds.fx.length) {
				var soundIndex = pendingSounds.indexOf(e.src);

				if (soundIndex >= 0) {
					pendingSounds.splice(soundIndex, 1);
					soundInstance = createjs.Sound.play(e.src, createjs.Sound.INTERRUPT_EARLY, 0, 0, 1);
				}
			}

			if (!soundInstance && pendingSounds.bg === e.src) {
				soundInstance = createjs.Sound.play(e.src, createjs.Sound.INTERRUPT_EARLY, 0, 0, -1);
				soundInstance.setVolume(0.2);

				this._backgroundSoundInstance = soundInstance;
				pendingSounds.bg = null;
			}
		};

		/**
		 * Plays an fx sound once
		 * @param {String} src
		 */
		SoundManager.prototype.playFX = function(src) {
			this._pendingSounds.fx.push(src);

			createjs.Sound.registerSound(src);
			return true;
		};

		/**
		 * Plays a background sound. There can be only one background sound at a time.
		 * @param {String} src
		 */
		SoundManager.prototype.playBackground = function(src) {
			this._pendingSounds.bg = src;

			createjs.Sound.registerSound(src);
			return true;
		};

		SoundManager.prototype.stopBackground = function() {
			this._pendingSounds.bg = null;

			if (this._backgroundSoundInstance) {
				// TODO: Complete
			}
		};

		return new SoundManager();
	});
}) ();