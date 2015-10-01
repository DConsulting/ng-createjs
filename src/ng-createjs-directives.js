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

        createjs.Sound.alternateExtensions = ["mp3", "aac", "aif", "mp4"];
		createjs.Sound.registerPlugins([createjs.LazyWebAudioPlugin]);


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

	.directive('backgroundSound', ['createjsConfig', function backgroundSound(createjsConfig) {

		BackgroundSoundCtrl.$inject = ['$scope', '$http', '$q', '$timeout'];
		function BackgroundSoundCtrl($scope, $http, $q, $timeout) {
			var audioCtx = createjs.LazyWebAudioPlugin._context;
			var ctrl = this;

			$scope.bufferData = null;

			this.preload = function() {
				var def = $q.defer();

				$http.get($scope.src, {responseType: 'arraybuffer'}).then(
					function onSuccess(response) {
						audioCtx.decodeAudioData(response.data, function(buffer) {
							$timeout(function () {
								$scope.bufferData = buffer;
								def.resolve();
							});
						});
					},
					function onError() {
						def.reject();
					}
				);

				return def.promise;
			};

			this.createBufferSource = function() {
				if (!$scope.bufferData) {
					throw 'BufferData is missing.';
				}

				$scope.bufferSource = audioCtx.createBufferSource();
				$scope.soundGain = audioCtx.createGain();
				$scope.soundGain.volume = 1;

				$scope.bufferSource.buffer = $scope.bufferData;
				$scope.bufferSource.connect($scope.soundGain);
				$scope.bufferSource.onended = function() {
					$scope.playing = false;
					ctrl.stop();
				};

				$scope.soundGain.connect(audioCtx.destination);
				$scope.soundGain.value = $scope.volume;
			};

			this.play = function() {
				if (!$scope.playing) {
					if (!$scope.bufferSource) {
						ctrl.createBufferSource();
					}

					$scope.playing = true;
					$scope.bufferSource.loop = true;
					$scope.bufferSource.start(0);
				}
			};

			this.stop = function() {
				if ($scope.bufferSource) {
					if ($scope.playing) {
						$scope.bufferSource.stop(0);
					}

					$scope.playing = false;
					$scope.soundGain.disconnect();
					$scope.bufferSource.disconnect();
					$scope.bufferSource.onended = null;
					$scope.bufferSource = null;
					$scope.soundGain = null;
				}
			};

			$scope.$on('$destroy', function() {
				ctrl.stop();
			});
		}

		return {
			restrict: 'AC',
			require: 'backgroundSound',
			controller: BackgroundSoundCtrl,
			scope: {
				src: '@',
				playWhen: '=?'
			},
			link: function (scope, iElement, iAttrs, ctrl) {
				if (createjsConfig.soundMuted) return;

				var srcUnwatch = scope.$watch('src', function(src) {
					if (src) {
						ctrl.preload().then(function() {
							ctrl.createBufferSource();

							if ('playWhen' in iAttrs) {
								scope.$watch('playWhen', function(value) {
									if (value) {
										ctrl.play();
									} else {
										ctrl.stop();
									}
								});
							} else {
								ctrl.play();
							}

						});

						srcUnwatch();
					}
				});
			}
		}
	}]);

}) ();