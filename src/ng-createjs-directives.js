/* global angular */
(function() {
	'use strict';

	angular.module('ng-createjs', [
		'ng-createjs.directives',
		'ng-createjs.services'
	]);

	angular.module('ng-createjs.directives', [
		'ng-createjs.services'
	])

		.run(['$log', 'createjsConfig', 'adobeAnimateSoundsMap', 'soundManager', function($log, createjsConfig, adobeAnimateSoundsMap, soundManager) {
			// Needed by flash. Don't remove.
			window.playSound = function(id, loop) {
				if (!createjsConfig.soundMuted) {
					var soundSrc = adobeAnimateSoundsMap[id];

					if (soundSrc) {
						soundManager.playFX(soundSrc, {
							loop: 0,
							delay: 0,
							offset: 0
						});
					} else {
						$log.error('Sound is missing.');
					}

					//createjs.Sound.play(id, createjs.Sound.INTERRUPT_EARLY, 0, 0, loop);
				}
			};

			createjs.Sound.alternateExtensions = ["mp3", "aac", "aif", "mp4"];

			//if (createjsConfig.inCordova) {
				//createjs.Sound.registerPlugins([createjs.CordovaAudioPlugin]);
			//} else {
				createjs.Sound.registerPlugins([createjs.WebAudioPlugin]);
			//}
		}])

		.directive('reusableCanvas', ['canvasPool', function reusableCanvas(canvasPool) {
			var canvasPool = [];

			ReusableCanvas.$inject = ['$scope', '$element', '$attrs', 'canvasPool'];
			function ReusableCanvas($scope, $element, $attrs, canvasPool) {
				var domCanvas = null;

				this.canvas = function() {
					if (!domCanvas) {
						domCanvas = canvasPool.createCanvas();

						if ($attrs.width) {
							domCanvas.width = parseInt($attrs.width);
						}

						if ($attrs.height) {
							domCanvas.height = parseInt($attrs.height);
						}

						$element.append(domCanvas);
					}

					return domCanvas;
				};

				$scope.$on('$destroy', function() {
					if (domCanvas) {
						canvasPool.releaseCanvas(domCanvas);
					}
				});
			}

			return {
				restrict: 'EA',
				controller: ReusableCanvas,
				require: 'reusableCanvas',
				link: function postLink(scope, iElement, iAttrs, ctrl) {

				}
			};
		}])

		.directive('flashCanvasProxy', ['flashCanvases', '$timeout', function flashCanvasProxy(flashCanvases, $timeout) {
			return {
				scope: {
					onLoaded: '&',
					publishAs: '=?',
					canvasId: '@'
				},
				link: function(scope, iElement, iAttrs) {
					var flashCtrl = flashCanvases[scope.canvasId];

					if (!flashCtrl) {
						throw 'No cached flashCanvas found with id "' + scope.canvasId + '".';
					}

					if ('publishAs' in iAttrs) {
						scope.publishAs = flashCtrl;
					}

					var loadedHandler = function() {
						scope.onLoaded({
							stage: flashCtrl.stage,
							root: flashCtrl.root
						});

						var proxyOffset = iElement.offset();

						flashCtrl.canvasManager.listenForTicks(true);
						flashCtrl.refreshGlobalSoundsMap();

						// TODO: Add positioning handling
						//flashCtrl.$element.css({
						//	position: 'absolute',
						//	top: proxyOffset.top,
						//	left: proxyOffset.left
						//});

						flashCtrl.$element.show();
					};

					if (flashCtrl.isLoaded()) {
						$timeout(function() {
							loadedHandler();
						});
					} else {
						flashCtrl.onLoaded.push(loadedHandler);
					}

					scope.$on('$destroy', function() {
						var handlerIndex = flashCtrl.onLoaded.indexOf(loadedHandler);
						flashCtrl.onLoaded.splice(handlerIndex, 1);

						flashCtrl.$element.hide();
						flashCtrl.canvasManager.listenForTicks(false);
					});
				}
			};
		}])

		.directive('flashCanvas', ['$http', 'adobeAnimateSoundsMap', 'flashCanvases', function flashCanvas($http, adobeAnimateSoundsMap, flashCanvases) {
			FlashCanvasCtrl.$inject = ['$scope', '$element', '$timeout', 'soundManager'];

			function FlashCanvasCtrl($scope, $element, $timeout, soundManager) {
				this.$scope = $scope;
				this.$timeout = $timeout;
				this.$element = $element;
				this.soundManager = soundManager;

				this._usedSounds = [];
				this.proxyControlled = false;

				/**
				 * List with callback to execute
				 * @type {Array}
				 */
				this.onLoaded = [];

				/**
				 * @type {Array}
				 */
				this.onStageDestroy = [];

				/**
				 * @type {Array}
				 */
				this.onManagerDispose =[];
			}

			FlashCanvasCtrl.prototype.initialize = function(jqCanvas) {
				var $scope = this.$scope;
				var $element = this.$element;
				var $timeout = this.$timeout;
				var soundManager = this.soundManager;
				var events = createjsUtil.FlashCanvasManager.Events;
				var self = this;

				this.canvasManager = new createjsUtil.FlashCanvasManager((jqCanvas || $element)[0]);

				this.canvasManager.on(events.DISPOSE, function() {
					if (self.onManagerDispose.length) {
						angular.forEach(self.onManagerDispose, function(callback) {
							callback();
						});
					}
				});

				this.canvasManager.on(events.STAGE_DESTROY, function() {
					if (self.onStageDestroy.length) {
						angular.forEach(self.onStageDestroy, function(callback) {
							callback();
						});
					}
				});

				this.canvasManager.on(events.LOAD_MANIFEST, function(e) {
					var spriteSheets = self._parseSpriteSheets($scope.spriteSheets, $scope.basePath);
					var queue = e.loadQueue;

					angular.forEach(spriteSheets, function(file) {
						queue.loadFile(file, true);
					})
				});

				this.canvasManager.on(events.STAGE_READY, function(e) {
					var stage = e.target.stage;
					var root = e.target.root;
					var lib = e.target.lib;

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
				});

				this.canvasManager.removeSounds = function() {
					angular.forEach(self._usedSounds, function(soundData) {
						soundManager.removeSound(soundData.src);
					});

					self._usedSounds = [];
				};

				this.canvasManager._removeSound = function(src) {
					throw 'Not implemented in ng-createjs-directives.';
				};

				this.canvasManager.resolveManifestPath = function(entry) {
					var entrySrc = entry.src;
					var entryId = entry.id || entry.src;

					if (entrySrc.substr(entrySrc.length - 4) === '.mp3') {
						if (!self.proxyControlled) {
							adobeAnimateSoundsMap[entryId] = self.canvasManager.baseManifestPath() + entrySrc;
						}

						self._usedSounds.push({id: entryId, src: entrySrc});
						return null;
					}

					return entrySrc;
				};
			};

			FlashCanvasCtrl.prototype.refreshGlobalSoundsMap = function() {
				if (this._usedSounds) {
					var basePath = this.canvasManager.baseManifestPath();

					angular.forEach(this._usedSounds, function(soundData) {
						adobeAnimateSoundsMap[soundData.id] = basePath + soundData.src;
					});
				}
			};

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

			FlashCanvasCtrl.prototype.isLoaded = function() {
				return this.stage != null && this.root != null;
			};

			FlashCanvasCtrl.prototype.loadScript = function() {
				var $scope = this.$scope;
				var $timeout = this.$timeout;
				var assetsPath = $scope.assetsPath;
				var basePath = $scope.basePath;
				var self = this;

				if (basePath && basePath.charAt(basePath.length - 1) != '/') {
					basePath += '/'; // TODO: Can't we pass this directly to the LoadQueue?
				}

				var rootName = $scope.options.root;
				var canvasManager = this.canvasManager;
				var scriptPath = $scope.basePath + $scope.contentScript;
				var scriptPromise = $http.get(scriptPath, {cache: true});

				canvasManager.baseManifestPath(basePath + assetsPath);
				canvasManager.loadScriptPromise(scriptPromise, rootName,
					function() {
						$timeout(function() {
							self.stage = canvasManager.stage;
							self.root = canvasManager.root;

							if (self.proxyControlled) {
								canvasManager.listenForTicks(false);
								self.$element.hide();
							}

							$scope.onLoaded({
								stage: canvasManager.stage,
								root: canvasManager.root
							});

							if (self.onLoaded.length) {
								angular.forEach(self.onLoaded, function(callback) {
									callback();
								});
							}
						});
					}
				);
			};

			FlashCanvasCtrl.prototype.clearStage = function(destroyStage) {
				this.canvasManager.clearStage(destroyStage);

				this.stage = null;
				this.root = null;
			};

			//createjs.EventDispatcher.initialize(FlashCanvasCtrl.prototype);

			return {
				scope: {
					onLoaded: '&',
					assetsPath: '@',
					spriteSheets: '@', // sprite-sheets="home/images/home_atlas_"
					basePath: '@',
					contentScript: '@',
					options: '=?flashCanvas',
					publishAs: '=?',
					scaleMode: '@',
					canvasId: '@' // id you can use while the element exists. Allows it to be placed on top of a flashCanvasProxy directive
				},
				require: ['flashCanvas', '?reusableCanvas'],
				restrict: 'AC',
				controller: FlashCanvasCtrl,
				link: function postLink(scope, iElement, iAttrs, ctrls) {
					var flashCtrl = ctrls[0];
					var reusableCtrl = ctrls[1];
					var jqCanvas = reusableCtrl ? angular.element(reusableCtrl.canvas()) : iElement;
					var canvasId = scope.canvasId;

					if (!jqCanvas.is('canvas')) {
						throw 'FlashCanvas directive requires a canvas element!';
					}

					flashCtrl.proxyControlled = 'proxyControlled' in iAttrs;
					flashCtrl.initialize(jqCanvas);

					if (!jqCanvas.attr('width')) {
						jqCanvas.prop('width', jqCanvas.width());
					}

					if (!jqCanvas.attr('height')) {
						jqCanvas.prop('height', jqCanvas.height());
					}

					if ('publishAs' in iAttrs) {
						scope.publishAs = flashCtrl;
					}

					if (canvasId) {
						flashCanvases[canvasId] = flashCtrl;
					}

					scope.$watch('options', function(options) {
						if (options === undefined) return;

						flashCtrl.clearStage(false);
						flashCtrl.loadScript();
					});

					scope.$on('$destroy', function() {
						// ctrl.clearStage(true); TODO: Shouldn't we call this?
						flashCtrl.canvasManager.dispose();
						scope.disposed = true;

						if (canvasId) {
							delete flashCanvases[canvasId];
						}
					});
				}
			}
		}])

		.directive('backgroundSound', ['createjsConfig', '$timeout', 'soundManager', function backgroundSound(createjsConfig, $timeout, soundManager) {

			return {
				restrict: 'AC',
				scope: {
					src: '@',
					playWhen: '=?',
					onReady: '&'
				},
				link: function (scope, iElement, iAttrs) {
					if (createjsConfig.soundMuted) return;

					var soundInstance = null;
					var srcUnwatch = scope.$watch('src', function(src) {
						if (src) {
							soundManager.registerBackground(src).then(
								function() {
									$timeout(function() {
										scope.onReady();
									});

									if ('playWhen' in iAttrs) {
										scope.$watch('playWhen', function(value) {
											if (value) {
												soundManager.playBackground(scope.src).then(function(instance) {
													soundInstance = instance;
												});
											} else {
												if (soundInstance) {
													soundInstance.stop();
												}
											}
										});
									} else {
										soundManager.playBackground(scope.src).then(function(instance) {
											soundInstance = instance;
										});
									}
								}
							);

							srcUnwatch();
						}
					});

					scope.$on('$destroy', function() {
						if (scope.src) {
							soundManager.removeBackground(scope.src);
							soundInstance = null;
						}
					});
				}
			}
		}]);

}) ();