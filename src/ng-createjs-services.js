(function() {
	'use strict';

	angular.module('ng-createjs.services', [])

	.constant('createjsConfig', {
		inCordova: 'cordova' in window,
		forgetBufferOnClean: false, // Will be passed to the LazyWebAudio
		soundMuted: false
	})

	.constant('adobeAnimateSoundsMap', {
		// Sound id to src used for Adobe Animate exports
	})

	.constant('soundManagerConfig', {
		debugLog: false,
		defaultPlaybackOptions: {
			volume: 1, // Default volume
			loop: 0, // Don't loop
			delay: 0 // No delay
		},
		defaultBackgroundOptions: {
			volume: 1,
			loop: -1,
			delay: 0
		}
	})

	.constant('canvasPoolConfig', {
		debugLog: true,
		createdCount: 0
	})

	.constant('flashCanvases', { })

	.service('canvasPool', ['$log', 'canvasPoolConfig', function canvasPool($log, canvasPoolConfig) {
		var canvasDepot = [];

		this.createCanvas = function(width, height) {
			var domCanvas = null;

			if (canvasDepot.length) {
				domCanvas = canvasDepot.pop();
			} else {
				canvasPoolConfig.createdCount++;

				if (canvasPoolConfig.debugLog) {
					$log.log('canvasPool create | total:', canvasPoolConfig.createdCount);
				}

				domCanvas = document.createElement('canvas');
			}

			if (width != null) {
				domCanvas.width = parseInt(width);
			}

			if (height != null) {
				domCanvas.height = parseInt(height);
			}

			return domCanvas;
		};

		/**
		 *
		 * @param {(jQuery|Element)} canvas
		 */
		this.releaseCanvas = function(canvas) {
			if (canvas == null) { // jshint ignore:line
				throw 'Canvas can\'t be null.';
			} else if (canvas instanceof jQuery) {
				canvas = canvas[0];
			}

			canvasDepot.push(canvas);

			if (canvasPoolConfig.debugLog) {
				$log.log('canvasPool release | poolSize:', canvasDepot.length);
			}
		};
	}])

	.factory('soundManager', ['$timeout', '$q', '$log', 'soundManagerConfig', function($timeout, $q, $log, soundManagerConfig) {
		SoundManager.SOUND_STATE_NONE = 0;

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

			createjs.Sound.on('fileload', this._soundLoadHandler, this);
		}

		/**
		 *
		 * @type {{}}
		 * @private
		 */
		SoundManager.prototype._backgroundSoundInstances = {};

		/**
		 *
		 * @param {*} e
		 * @returns {promise|{then, fail}}
		 * @private
		 */
		SoundManager.prototype._soundLoadHandler = function(e) {
			var soundState = this._soundState[e.src];

			if (soundState) {
				$timeout(function() {
					soundState.loadingInfo = SoundManager.SOUND_STATE_READY;

					if (soundState.registerQueue.length) {
						var registerQueue = soundState.registerQueue;
						soundState.registerQueue = [];

						angular.forEach(registerQueue, function (registerDefer) {
							registerDefer.resolve(soundState);
						});
					}
				});
			}
		};

		SoundManager.prototype.registerSound = function(src, options) {
			var def = $q.defer();
			var self = this;
			var activePlugin = createjs.Sound.activePlugin;
			var preloadStarted = activePlugin.isPreloadStarted(src);
			var preloadCompleted = activePlugin.isPreloadComplete(src);
			var details = false;

			if (preloadCompleted) {
				details = true;
			} else if (preloadStarted) {
				details = {src: src}; // Fake object
			} else {
				details = createjs.Sound.registerSound(src); // src as id
			}

			var soundState = self._soundState[src];
			if (!soundState) {
				self._soundState[src] = soundState = {
					loadingInfo: SoundManager.SOUND_STATE_NONE,
					playing: 0,
					src: null,
					playbackOptions: null,
					registerQueue: []
				};
			}

			soundState.src = src;
			soundState.playbackOptions = angular.extend({}, soundManagerConfig.defaultPlaybackOptions, options);

			if (soundManagerConfig.debugLog) {
				$log.log("sound register:", src, '| options:', soundState.playbackOptions);
			}

			if (details === false) {
				// Failed to register sound
				soundState.loadingInfo = SoundManager.SOUND_STATE_NONE;
				def.reject();
			} else if (details === true) {
				// Sound is already registered
				soundState.loadingInfo = SoundManager.SOUND_STATE_READY;
				def.resolve(soundState);
			} else {
				// Began sound loading
				soundState.loadingInfo = SoundManager.SOUND_STATE_LOADING;
				soundState.registerQueue.push(def);
			}

			return def.promise;
		};

		/**
		 *
		 * @param {String} src
		 * @param {Object} [options]
		 * @returns {promise|{then, fail}}
		 */
		SoundManager.prototype.playSound = function(src, options) {
			var def = $q.defer();
			var self = this;

			self.registerSound(src, options).then(
				function(soundState) {
					var soundOptions = soundState.playbackOptions;
					var soundInstance = createjs.Sound.play(soundState.src, createjs.Sound.INTERRUPT_EARLY,
						soundOptions.delay,
						soundOptions.offset,
						soundOptions.loop,
						soundOptions.volume
					);

					if (soundManagerConfig.debugLog) {
						$log.log('sounds play:', src, '| loop:', soundOptions.loop);
					}

					def.notify({type: 'created', soundInstance: soundInstance, soundState: soundState});

					soundState.playing++;

					soundInstance.on('complete', function() {
						$timeout(function() {
							soundState.playing--;
							def.resolve(soundInstance);
						});
					});

					soundInstance.on('failed', function(e) {
						$timeout(function() {
							soundState.playing--;
							def.reject(e);
						});
					});

					if (soundInstance.playState === createjs.Sound.PLAY_FAILED) {
						// Something went wrong. Most probably it's due to a lack of available channels. Play the sound manually.
						soundInstance.play();

						if (soundInstance.playState === createjs.Sound.PLAY_FAILED) {
							// Failed the second time. Clear the play state.
							soundState.playing--;
						}
					}
				},
				function(e) {
					def.reject(e);
				}
			);

			return def.promise;
		};

		/**
		 * Plays an fx sound once. Will be unloaded after it's played.
		 * @param {String} src
		 * @param {Object} sound options
		 * @returns {promise|{then, fail}}
		 */
		SoundManager.prototype.playFX = function(src, options) {
			var self = this;
			var def = $q.defer();

			this.playSound(src, options).then(
				function() {
					var soundState = self._soundState[src];

					// No access to the sound instance is allowed. We destroy the sound on completion.
					// If someone started new sound play don't destroy the sound. It's still in use.
					if (soundState && soundState.playing <= 0) {
						self.removeSound(src);
					}

					def.resolve();
				},
				function() {
					def.reject();
				}
			);

			return def.promise;
		};

		SoundManager.prototype.isBackgroundSound = function(src) {
			return this._backgroundSoundInstances[src] != null;
		};

		/**
		 * NOTE: Doesn't remove background sounds
		 */
		SoundManager.prototype.removeAllSounds = function() {
			var soundsToRemove = [];

			for (var soundSrc in this._soundState) {
				if (this._soundState[soundSrc] && !this.isBackgroundSound(soundSrc)) {
					soundsToRemove.push({src: soundSrc});
					this._soundState[soundSrc] = null;
				}
			}

			var removeResult = createjs.Sound.removeSounds(soundsToRemove);

			if (soundManagerConfig.debugLog) {
				$log.log('sounds removeAll:', soundsToRemove.length);
			}

			for (var i = 0, len = removeResult.length; i < len; i++) {
				if (removeResult[i] !== true) {
					$log.error('Failed to remove sound:', soundsToRemove[i]);
				}
			}
		};

		/**
		 * Removes and cleans up a sound. Can be used for background sound, sound and fx.
		 * @param {String} src
		 * @returns {Boolean} true if the sound was removed
		 */
		SoundManager.prototype.removeSound = function(src) {
			var removeResult = createjs.Sound.removeSound(src);
			this._soundState[src] = null;

			if (this.isBackgroundSound(src)) {
				this._backgroundSoundInstances[src] = null;
			}

			if (soundManagerConfig.debugLog) {
				$log.log('sounds remove:', src);
			}

			if (removeResult !== true) {
				$log.error('Failed to remove sound:', src);
			}

			return removeResult;
		};

		SoundManager.prototype.registerBackground = function(src) {
			this._backgroundSoundInstances[src] = {};

			return this.registerSound(src, soundManagerConfig.defaultBackgroundOptions);
		};

		/**
		 * Plays a background sound. There can be only one background sound at a time.
		 * TODO: Add a ways to differentiate background sound from regular sounds.
		 * @param {String} src
		 */
		SoundManager.prototype.playBackground = function(src) {
			var self = this;
			var def = $q.defer();

			this.playSound(src, soundManagerConfig.defaultBackgroundOptions).then(
				function() { },
				function() {
					return $q.reject();
				},
				function(evt) {
					if (evt.type === 'created') {
						// For background sounds creating the itance means the sound will start.
						self._backgroundSoundInstances[src] = evt.soundInstance;
						def.resolve(evt.soundInstance);
					}
				}
			);

			return def.promise;
		};

		SoundManager.prototype.removeBackground = function(src) {
			if (this.isBackgroundSound(src)) {
				if (soundManagerConfig.debugLog) {
					$log.log('sounds removeBackground:', src);
				}

				this.removeSound(src);
			}
		};

		return new SoundManager();
	}]);
}) ();