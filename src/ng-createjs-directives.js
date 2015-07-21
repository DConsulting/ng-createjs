(function() {
	'use strict';

	angular.module('ng-createjs', [
		'ng-createjs.directives',
		'ng-createjs.services'
	]);

	angular.module('ng-createjs.directives', [
		'ng-createjs.services'
	])

	.run(['createjsConfig', function(createjsConfig) {
		// Needed by flash. Don't remove.
		window.playSound = function(id, loop) {
			if (!createjsConfig.soundMuted) {
				createjs.Sound.play(id, createjs.Sound.INTERRUPT_EARLY, 0, 0, loop);
			}
		};

        if ('cordova' in window) {
            //createjs.HTMLAudioPlugin.enableIOS = true;
            createjs.Sound.alternateExtensions = ["mp3", "aac", "aif", "mp4"];
            createjs.Sound.registerPlugins([createjs.LowLatencyAudioPlugin]);
        }
		//if (createjsConfig.inCordova) {
			// We don't care about the plugins if this is inside the browser.
			// That why we need to know if we are in a phonegap app.
			//createjs.Sound.alternateExtensions = ["mp3", "aac", "aif", "mp4"];
			//createjs.Sound.registerPlugins([createjs.PhonegapAudioPlugin]);
		//}
	}])

	.directive('flashCanvas', ['$http', 'EventDispatcher', function flashCanvas($http, EventDispatcher) {
		FlashCanvasCtrl.$inject = ['$scope', '$element', '$timeout'];

		function FlashCanvasCtrl($scope, $element, $timeout) {
			EventDispatcher.call(this);

			var self = this;
			var events = createjsUtil.FlashCanvasManager.Events;

			this.$scope = $scope;
			this.$timeout = $timeout;
			this.$element = $element;

			this.canvasManager = new createjsUtil.FlashCanvasManager($element[0]);

			this.canvasManager.on(events.DISPOSE, function() {
				self.trigger(events.DISPOSE);
			});

			this.canvasManager.on(events.STAGE_DESTROY, function() {
				self.trigger(events.STAGE_DESTROY);
			});

			this.canvasManager.on(events.LOAD_MANIFEST, function(e) {
				var spriteSheets = self._parseSpriteSheets($scope.spriteSheets, $scope.basePath);
				var queue = e.loadQueue;

				angular.forEach(spriteSheets, function(file) {
					queue.loadFile(file, true);
				})
			});
		}

		phonegular.extendClass(FlashCanvasCtrl, EventDispatcher);

		FlashCanvasCtrl.prototype.isDisposed = function() {
			return this.canvasManager && this.canvasManager.isDisposed();
		};

		/**
		 * @param {String} rawSpriteSheets Raw string as it comes from the attribute
		 * @param [String] basePath
		 * @returns {Array}
		 * @private
		 */
		FlashCanvasCtrl.prototype._parseSpriteSheets = function(rawSpriteSheets, basePath) {
			if (!rawSpriteSheets) return [];

			var spriteSheets = rawSpriteSheets.split(',');
			var trimRegex = /^\s+|\s+$/g;

			return spriteSheets.map(function(spriteSheet) {
				var sheetUrl = spriteSheet.replace(trimRegex, '');
				var sheetId = sheetUrl.substr(sheetUrl.lastIndexOf('/') + 1);

				return {
					src: sheetUrl + '.json',
					type: 'spritesheet',
					id: sheetId
				};
			});
		};

		FlashCanvasCtrl.prototype.loadScript = function() {
			var $scope = this.$scope;
			var $timeout = this.$timeout;
			var $element = this.$element;
			var assetsPath = $scope.assetsPath;
			var basePath = $scope.basePath;

			var ctrl = this;

			if (basePath && basePath.charAt(basePath.length - 1) != '/') {
				basePath += '/'; // TODO: Can't we pass this directly to the LoadQueue?
			}

			var rootName = $scope.options.root;
			var canvasManager = this.canvasManager;
			var scriptPath = $scope.basePath + $scope.contentScript;
			var scriptPromise = $http.get(scriptPath, {cache: true});

			canvasManager.baseManifestPath(basePath + assetsPath);

			canvasManager.cacheIdForPromise = function() {
				return scriptPath;
			};

			canvasManager.prepareStage = function(stage, root, lib) {
				var opts = angular.extend({scaleX: 1, scaleY: 1}, $scope.options);
				var ratioX = $element.prop('width') / lib.properties.width;
				var ratioY = $element.prop('height') / lib.properties.height;

				switch ($scope.scaleMode) {
					case 'contain':
						ratioX = ratioY = Math.min(ratioX, ratioY);
						stage.scaleX = ratioX;
						stage.scaleY = ratioY;
						break;

					case 'cover':
						stage.scaleX = ratioX;
						stage.scaleY = ratioY;
						break;

					default:
						// If scale mode isn't contain then we can use the custom scaling passed in the options
						stage.scaleX = opts.scaleX;
						stage.scaleY = opts.scaleY
				}
			};

			canvasManager.loadScriptPromise(scriptPromise, rootName,
				function() {
					$timeout(function() {
						ctrl.stage = canvasManager.stage;
						ctrl.root = canvasManager.root;

						$scope.onLoaded({
							stage: canvasManager.stage,
							root: canvasManager.root
						});
					});
				}
			);
		};

		FlashCanvasCtrl.prototype.clearStage = function(destroyStage) {
			this.canvasManager.clearStage(destroyStage);

			this.stage = null;
			this.root = null;
		};

		return {
			scope: {
				onLoaded: '&',
				assetsPath: '@',
				spriteSheets: '@', // sprite-sheets="home/images/home_atlas_"
				basePath: '@',
				contentScript: '@',
				options: '=?flashCanvas',
				publishAs: '=?',
				scaleMode: '@'
			},
			require: 'flashCanvas',
			restrict: 'AC',
			template: '<canvas>',
			replace: true,
			controller: FlashCanvasCtrl,
			link: function postLink(scope, iElement, iAttrs, ctrl) {
				if (!iElement.attr('width')) {
					iElement.prop('width', iElement.width());
				}

				if (!iElement.attr('height')) {
					iElement.prop('height', iElement.height());
				}

				if ('publishAs' in iAttrs) {
					scope.publishAs = ctrl;
				}

				scope.$watch('options', function(options) {
					if (options === undefined) return;

					ctrl.clearStage(false);
					ctrl.loadScript();
				});

				scope.$on('$destroy', function() {
					// ctrl.clearStage(true); TODO: Shouldn't we call this?
					ctrl.canvasManager.dispose();
					scope.disposed = true;
				});
			}
		}
	}])

	.directive('backgroundSound', ['createjsConfig', '$timeout', function backgroundSound(createjsConfig, $timeout) {
		var DEFAULT_VOLUME = 0.2;

		return {
			restrict: 'AC',
			link: function (scope, iElement, iAttrs) {
				var soundInstance = null;
				var pendingMute = false;

				if (createjsConfig.soundMuted) return;

				function loadHandler(e) {
					if (iAttrs.src === e.src) {
						createjs.Sound.removeEventListener('fileload', loadHandler);
						soundInstance = createjs.Sound.play(iAttrs.src, createjs.Sound.INTERRUPT_EARLY, 0, 0, -1);
						soundInstance.setVolume(pendingMute ? 0 : DEFAULT_VOLUME);

						if (soundInstance.playState === createjs.Sound.PLAY_FAILED) {
							// Something went wrong. Most probably it's due to a lack of available channels. Play the sound manually.
							soundInstance.play();
						}

						pendingMute = false;
					}
				}

				if ('muteIf' in iAttrs) {
					scope.$watch(iAttrs.muteIf, function (value) {
						if (soundInstance) {
							soundInstance.setVolume(value ? 0 : DEFAULT_VOLUME);
						} else {
							pendingMute = value;
						}
					});
				}

				scope.$on('$destroy', function () {
					createjs.Sound.removeEventListener('fileload', loadHandler);

					if (soundInstance) {
						soundInstance.stop();
						soundInstance.removeAllEventListeners();

						try {
							createjs.Sound.removeSound(iAttrs.src);
						} catch(e) {
							// OK, createjs removeSound crashes sometimes when duration is missing.
						}
					}
				});

				createjs.Sound.addEventListener('fileload', loadHandler);
				var response = createjs.Sound.registerSound(iAttrs.src);

				if (response === true) {
					$timeout(function() {
						loadHandler({src: iAttrs.src});
					}, 0, false);
				}
			}
		}
	}]);

}) ();