(function() {
	'use strict';

	angular.module('ng-createjs.services', [])

	.constant('createjsConfig', {
		inCordova: 'cordova' in window,
		soundMuted: false
	})

	.constant('soundManagerConfig', {
		defaultPlaybackOptions: {
			volume: 1, // Default volume
			loop: 0, // Don't loop
			delay: 0 // No delay
		},
		defaultBackgroundOptions: {
			volume: .2,
			loop: -1,
			delay: 0
		}
	})

	.factory('soundManager', ['$timeout', 'soundManagerConfig', function($timeout, soundManagerConfig) {

		/**
		 * Sound is still loading. There is an active load operation.
		 * @type {number}
		 */
		SoundManager.SOUND_STATE_LOADING = 1;

		/**
		 * Sound is loaded. You can play it whenever you want.
		 * @type {number}
		 */
		SoundManager.SOUND_STATE_READY = 2;

		function SoundManager() {
			/**
			 * Sound id to sound status
			 * @private
			 */
			this._soundState = {};

			createjs.Sound.addEventListener('fileload', createjs.proxy(this._soundLoadHandler, this));
		}

		SoundManager.prototype.config = {
			defaultPlaybackOptions: {
				volume: 1, // Default volume
				loop: 0, // Don't loop
				delay: 0, // No delay
				offset: 0
			},
			defaultBackgroundOptions: {
				volume: .2,
				loop: -1,
				delay: 0,
				offset: 0
			}
		};

		SoundManager.prototype._soundLoadHandler = function(e) {
			var soundState = this._soundState[e.src];

			if (soundState) {
				soundState.loadingInfo = SoundManager.SOUND_STATE_READY;

				var soundOptions = soundState.playbackOptions;
				var soundInstance = createjs.Sound.play(e.src, createjs.Sound.INTERRUPT_EARLY,
					soundOptions.delay,
					soundOptions.offset,
					soundOptions.loop,
					soundOptions.volume
				);

				if (soundInstance.playState === createjs.Sound.PLAY_FAILED) {
					// Something went wrong. Most probably it's due to a lack of available channels. Play the sound manually.
					soundInstance.play();
				}
			}
		};

		SoundManager.prototype.playSound = function(src, options) {
			var self = this;
			var details = true;
			var soundState = this._soundState[src];

			if (!soundState) {
				this._soundState[src] = soundState = {
					loadingInfo: 0
				};
			}

			soundState.src = src;
			soundState.playbackOptions = angular.extend(soundManagerConfig.defaultPlaybackOptions, options);

			switch (soundState.loadingInfo) {
				case SoundManager.SOUND_STATE_LOADING:
					// Someone already started this sound. Do nothing.
					return true;

				case SoundManager.SOUND_STATE_READY:
					$timeout(function() {
						// We need this outside $apply phases or it will block drawing.
						self._soundLoadHandler({src: src});
					}, 0, false);
					break;

				default:
					soundState.loadingInfo = SoundManager.SOUND_STATE_LOADING;
					details = createjs.Sound.registerSound(src);
					break;
			}
			return details !== false;
		};

		/**
		 * Plays an fx sound once
		 * @param {String} src
		 * @param {Object} sound options
		 */
		SoundManager.prototype.playFX = function(src, options) {
			return this.playSound(src, options);
		};

		/**
		 * Plays a background sound. There can be only one background sound at a time.
		 * TODO: Add a ways to differentiate background sound from regular sounds.
		 * @param {String} src
		 */
		SoundManager.prototype.playBackground = function(src) {
			return this.playSound(src, soundManagerConfig.defaultBackgroundOptions);
		};

		SoundManager.prototype.stopBackground = function() {
			// TODO: Complete
		};

		return new SoundManager();
	}]);
}) ();