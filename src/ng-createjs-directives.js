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

		if (createjsConfig.inCordova) {
			// We don't care about the plugins if this is inside the browser.
			// That why we need to know if we are in a phonegap app.
			createjs.Sound.alternateExtensions = ["mp3", "aac", "aif", "mp4"]; // TODO: Add all supported phonegap sound formats
			createjs.Sound.registerPlugins([createjs.PhonegapAudioPlugin]);
		}
	}])

	.directive('flashCanvas', ['$http', function flashCanvas($http) {
		FlashCanvasCtrl.$inject = ['$scope', '$element', '$timeout'];

		function FlashCanvasCtrl($scope, $element, $timeout) {
			this.$scope = $scope;
			this.$timeout = $timeout;

			this.canvasManager = new createjsUtil.FlashCanvasManager($element[0]);
		}

		FlashCanvasCtrl.prototype.loadScript = function() {
			var $scope = this.$scope;
			var $timeout = this.$timeout;
			var assetsPath = $scope.assetsPath;
			var basePath = $scope.basePath;
			var ctrl = this;

			if (basePath && basePath.charAt(basePath.length - 1) != '/') {
				basePath += '/'; // TODO: Can't we pass this directly to the LoadQueue?
			}

			var canvasManager = this.canvasManager;
			var scriptPath = $scope.basePath + $scope.contentScript;
			var scriptPromise = $http.get(scriptPath, {cache: true});

			canvasManager.baseManifestPath(basePath + assetsPath);

			canvasManager.cacheIdForPromise = function() {
				return scriptPath;
			};

			canvasManager.prepareStage = function(stage, root) {
				var opts = angular.extend({scaleX: 1, scaleY: 1}, $scope.options);

				stage.scaleX = opts.scaleX;
				stage.scaleY = opts.scaleY
			};

			canvasManager.loadScriptPromise(scriptPromise, $scope.options.root, function() {
				$timeout(function() {
					ctrl.stage = canvasManager.stage;
					ctrl.root = canvasManager.root;

					$scope.onLoaded({
						stage: canvasManager.stage,
						root: canvasManager.root
					});
				});
			});
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
				basePath: '@',
				contentScript: '@',
				options: '=?flashCanvas',
				publishAs: '=?'
			},
			require: 'flashCanvas',
			restrict: 'AC',
			template: '<canvas>',
			replace: true,
			controller: FlashCanvasCtrl,
			link: function postLink(scope, iElement, iAttrs, ctrl) {
				if ('publishAs' in iAttrs) {
					scope.publishAs = ctrl;
				}

				scope.$watch('options', function(options) {
					if (options === undefined) return;

					ctrl.clearStage(false);
					ctrl.loadScript();
				});

				scope.$on('$destroy', function() {
					ctrl.clearStage(true);
					ctrl.canvasManager.dispose();
					scope.disposed = true;
				});
			}
		}
	}])

	// FIXME: Probably not the best idea to force element only, consider changes.
	.directive('backgroundSound', ['createjsConfig', function backgroundSound(createjsConfig) {
		return {
			restrict: 'AC',
			link: function(scope, iElement, iAttrs) {
				var soundInstance = null;

				if (createjsConfig.soundMuted) return;

				createjs.Sound.addEventListener('fileload', createjs.proxy(loadHandler, this));
				createjs.Sound.registerSound(iAttrs.src);

				function loadHandler(e) {
					if (iAttrs.src === e.src) {
						soundInstance = createjs.Sound.play(iAttrs.src, createjs.Sound.INTERRUPT_EARLY, 0, 0, -1);
						soundInstance.setVolume(0.2);
					}
				}

				scope.$on('$destroy', function() {
					if (soundInstance) {
						soundInstance.stop();
						soundInstance.removeAllEventListeners();
					}
				});
			}
		}
	}])

}) ();