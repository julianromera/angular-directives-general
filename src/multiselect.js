(function () {
    'use strict';


    MultiselectParser.$inject = ['$parse'];
    function MultiselectParser ($parse) {
        //                      00000111000000000000022200000000000000003333333333333330000000000044000
        var TYPEAHEAD_REGEXP = /^\s*([\s\S]+?)(?:\s+as\s+([\s\S]+?))?\s+for\s+(?:([\$\w][\$\w\d]*))\s+in\s+([\s\S]+?)$/;

        return {
            parse: function (input) {

                var match = input.match(TYPEAHEAD_REGEXP);
                if (!match) {
                    throw new Error(
                      'Expected typeahead specification in form of "_modelValue_ (as _label_)? for _item_ in _collection_"' +
                        ' but got "' + input + '".');
                }

                return {
                    itemName: match[3],
                    source: $parse(match[4]),
                    viewMapper: $parse(match[2] || match[1]),
                    modelMapper: $parse(match[1])
                };
            }
        };
    }


    Multiselect.$inject = ['$parse', '$timeout', '$filter', '$document', '$compile', '$window', '$uibPosition', 'multiselectParser'];
    function Multiselect ($parse, $timeout, $filter, $document, $compile, $window, $position, optionParser) {
        return {
            restrict: 'EA',
            require: ['ngModel', '?^form'],
            link: function (originalScope, element, attrs, ctrls) {
                var modelCtrl = ctrls[0];
                var formCtrl = (ctrls.length > 1 && typeof (ctrls[1]) !== 'undefined') ? ctrls[1] : null;
                //model setter executed upon match selection
                var $setModelValue = $parse(attrs.ngModel).assign;
                var
                    parserResult = optionParser.parse(attrs.options),
                    isMultiple = attrs.multiple ? originalScope.$eval(attrs.multiple) : false,
                    isAutoFocus = attrs.autoFocus ? originalScope.$eval(attrs.autoFocus) : false,
                    isComplex = attrs.complexModels ? originalScope.$eval(attrs.complexModels) : false,
                    enableFilter = attrs.enableFilter ? originalScope.$eval(attrs.enableFilter) : true,
                    enableCheckAll = attrs.enableCheckAll ? originalScope.$eval(attrs.enableCheckAll) : true,
                    enableUncheckAll = attrs.enableUncheckAll ? originalScope.$eval(attrs.enableUncheckAll) : true,
                    header = attrs.header ? attrs.header : 'Select',
                    selectLimit = attrs.selectLimit ? originalScope.$eval(attrs.selectLimit) : 0,
                    useFiltered = attrs.selectLimitUseFiltered ?
                        originalScope.$eval(attrs.selectLimitUseFiltered) : true,
                    filterPlaceholder = attrs.filterPlaceholder ? attrs.filterPlaceholder : 'Filter ..',
                    checkAllLabel = attrs.checkAllLabel ? attrs.checkAllLabel : 'Check all',
                    uncheckAllLabel = attrs.uncheckAllLabel ? attrs.uncheckAllLabel : 'Uncheck all',
                    appendToBody = attrs.appendToBody ? originalScope.$eval(attrs.appendToBody) : false,
                    required = false,
                    lastSelectedLabel = '',
                    scope = originalScope.$new(true),
                    changeHandler = attrs.change || angular.noop,
                    popUpEl = angular.element('<multiselect-popup></multiselect-popup>'),
                    popupId = 'multiselect-' + scope.$id + '-' + Math.floor(Math.random() * 10000),
                    timeoutEventPromise,
                    eventDebounceTime = 200,

            isChecked = function (i) {
                return i.checked === true;
            },

            getFilteredItems = function () {
                var filteredItems = $filter('filter')(scope.items, scope.searchText);
                return filteredItems;
            },

            getFirstSelectedLabel = function () {
                for (var i = 0; i < scope.items.length; i++) {
                    if (scope.items[i].checked) {
                        return scope.items[i].label;
                    }
                }
                return header;
            },
            canCheck = function () {
                var belowLimit = false;
                var atLimit = false;
                var aboveLimit = false;
                if (selectLimit === 0 || !isMultiple) {
                    belowLimit = true;
                    atLimit = false;
                } else {
                    var checkedItems = scope.items.filter(isChecked);
                    atLimit = checkedItems.length === selectLimit;
                    aboveLimit = checkedItems.length > selectLimit;
                    belowLimit = checkedItems.length < selectLimit;
                }
                scope.maxSelected = atLimit || aboveLimit;
                return atLimit || belowLimit;
            },
            getHeaderText = function () {
                var localHeader = [header];
                if (isEmpty(modelCtrl.$modelValue)) {
                    scope.header = localHeader;
                    return localHeader;
                }
                if (isMultiple) {
                    var isArray = modelCtrl.$modelValue instanceof Array;
                    if (isArray && modelCtrl.$modelValue.length > 1) {
                        var items = [];
                        scope.items.filter( function (obj) {
                            return obj.checked;
                        }).forEach( function (item) {
                            items.push(item.label);
                        });
                        localHeader = items;
                    } else {
                        localHeader = [getFirstSelectedLabel()];
                    }
                } else {
                    localHeader = [getFirstSelectedLabel()];
                }
                scope.header = localHeader;
            },
            isEmpty = function (obj) {
                if (!obj) {
                    return true;
                }
                if (!isComplex && obj) {
                    return false;
                }
                if (obj.length && obj.length > 0) {
                    return false;
                }
                for (var prop in obj) {
                    if (obj[prop]) {
                        return false;
                    }
                }
                return true;
            },
            parseModel = function () {
                scope.items.length = 0;
                var model = parserResult.source(originalScope);
                if (!angular.isDefined(model)) {return;}
                var isArray = modelCtrl.$modelValue instanceof Array;
                for (var i = 0; i < model.length; i++) {
                    var local = {};
                    local[parserResult.itemName] = model[i];
                    var value = parserResult.modelMapper(local);
                    var isChecked = isArray ?
                        ((typeof value !== 'undefined' && modelCtrl.$modelValue.indexOf(value.toString()) !==  -1) || (typeof value !== 'undefined' && modelCtrl.$modelValue.indexOf(value) !== -1)) :
                        (!isEmpty(modelCtrl.$modelValue) && modelCtrl.$modelValue === value);
                    var item = {
                        label: parserResult.viewMapper(local),
                        model: model[i],
                        checked: isChecked
                    };
                    scope.items.push(item);
                }
                getHeaderText();
            },
            selectSingle = function (item) {
                if (item.checked) {
                    scope.uncheckAll();
                } else {
                    scope.uncheckAll();
                    item.checked = true;
                }
                setModelValue(false);
            },
            selectMultiple = function (item) {
                if (item.checked) {
                    item.checked = false;
                    canCheck();
                } else if (!scope.maxSelected) {
                    item.checked = canCheck();
                }
                setModelValue(true);
            },
            getModelValue = function (item) {
                var value;
                if (isComplex) {
                    value = item.model;
                }
                else {
                    var local = {};
                    local[parserResult.itemName] = item.model;
                    value = parserResult.modelMapper(local);
                }
                return value;
            },
            setModelValue = function (isMultiple) {
                var value;
                if (isMultiple) {
                    value = [];
                    angular.forEach(scope.items, function (item) {
                        if (item.checked) {
                            if (isComplex) {
                                value.push(item.model);
                            } else {
                                var local = {};
                                local[parserResult.itemName] = item.model;
                                value.push(parserResult.modelMapper(local));
                            }
                        }
                    });
                } else {
                    angular.forEach(scope.items, function (item) {
                        if (item.checked) {
                            if (isComplex) {
                                value = item.model;
                                return false;
                            }
                            else {
                                var local = {};
                                local[parserResult.itemName] = item.model;
                                value = parserResult.modelMapper(local);
                                return false;
                            }
                        }
                    });
                }
                scope.triggered = true;
                modelCtrl.$setViewValue(value);
            },

            markChecked = function (newVal) {
                if (!angular.isArray(newVal)) {
                    angular.forEach(scope.items, function (item) {
                        var value = getModelValue(item);
                        if (angular.equals(value, newVal)) {
                            item.checked = true;
                            return false;
                        }
                    });
                } else {
                    var itemsToCheck = [];
                    var itemsToUncheck = [];
                    var itemValues = [];
                    var i, j;
                    for (j = 0; j < scope.items.length; j++) {
                        itemValues.push(getModelValue(scope.items[j]));
                        itemsToUncheck.push(j);
                    }

                    for (i = 0; i < newVal.length; i++) {
                        for (j = 0; j < itemValues.length; j++) {
                            if (angular.equals(itemValues[j], newVal[i])) {
                                itemsToCheck.push(scope.items[j]);
                                var index = itemsToUncheck.indexOf(j);
                                itemsToUncheck.splice(index, 1);
                                break;
                            }
                        }
                    }

                    for (i = 0; i < itemsToCheck.length; i++) {
                        itemsToCheck[i].checked = true;
                    }

                    for (i = 0; i < itemsToUncheck.length; i++) {
                        scope.items[itemsToUncheck[i]].checked = false;
                    }

                }
            },
            recalculatePosition = function () {
                scope.position = appendToBody ? $position.offset($popup) : $position.position(element);
                scope.position.top += $popup.prop('offsetHeight');
            },
            fireRecalculating = function () {
                if (!scope.moveInProgress) {
                    scope.moveInProgress = true;
                    scope.$digest();
                }

                if (timeoutEventPromise) {
                    $timeout.cancel(timeoutEventPromise);
                }

                timeoutEventPromise = $timeout(function () {
                    if (scope.isOpen) {
                        recalculatePosition();
                    }
                    scope.moveInProgress = false;
                    scope.$digest();
                }, eventDebounceTime);
            };


            scope.items = [];
            scope.header = header;
            scope.multiple = isMultiple;
            scope.disabled = false;
            scope.filterPlaceholder = filterPlaceholder;
            scope.checkAllLabel = checkAllLabel;
            scope.uncheckAllLabel = uncheckAllLabel;
            scope.selectLimit = selectLimit;
            scope.enableFilter = enableFilter;
            scope.enableCheckAll = enableCheckAll;
            scope.enableUncheckAll = enableUncheckAll;
            scope.searchText = { label: '' };
            scope.isAutoFocus = isAutoFocus;
            scope.appendToBody = appendToBody;
            scope.moveInProgress = false;
            scope.popupId = popupId;
            scope.recalculatePosition = recalculatePosition;
            scope.isModelValueSet = false;

            originalScope.$on('$destroy', function () {
                scope.$destroy();
                $document.unbind('click', scope.clickHandler);
                if (appendToBody) {
                    $('#' + popupId).remove();
                }
            });

            if (appendToBody) {
                angular.element($window).bind('resize', fireRecalculating);
                $document.find('body').bind('scroll', fireRecalculating);
            }

            if (attrs.required || attrs.ngRequired) {
                required = true;
            }

            attrs.$observe('required', function (newVal) {
                required = newVal;
            });

            scope.$watch(function () {
                return $parse(attrs.ngDisabled)(originalScope);
            }, function (newVal) {
                scope.disabled = newVal;
            });

            scope.$watch(function () {
                return $parse(attrs.multiple)(originalScope);
            }, function (newVal) {
                isMultiple = newVal || false;
            });

            scope.$watch(function () {
                return parserResult.source(originalScope);
            }, function (newVal) {
                if (angular.isDefined(newVal)) {
                    parseModel();
                }
            }, true);

            scope.$watch(function () {
                return modelCtrl.$modelValue;
            }, function (newVal) {
                if (!scope.triggered) {
                    if (angular.isDefined(newVal)) {
                        var isArray = newVal instanceof Array;
                        if ((isArray && newVal.length === 0) || !isArray) {
                            scope.uncheckAll();
                        }
                        markChecked(newVal);
                        scope.isModelValueSet = true;
                        scope.isModelValueSet = false;
                    }
                }
                getHeaderText();
                canCheck();
                modelCtrl.$setValidity('required', scope.valid());
                scope.triggered = false;
            }, true);

            parseModel();
            var $popup = $compile(popUpEl)(scope);
            element.append($popup);
            $timeout(function () { recalculatePosition(); }, 100);

            scope.valid = function validModel() {
                if (!required) { return true; }
                var value = modelCtrl.$modelValue;
                return (angular.isArray(value) && value.length > 0) || (!angular.isArray(value) && value !== null);
            };

            scope.checkAll = function () {
                if (!isMultiple) {return;}
                var items = scope.items;
                var totalChecked = 0;
                if (useFiltered) {
                    items = getFilteredItems();
                    angular.forEach(items, function (item) {
                        item.checked = false;
                    });
                    totalChecked = scope.items.filter(isChecked).length;
                }
                if (selectLimit <= 0 || (items.length < selectLimit - totalChecked)) {
                    angular.forEach(items, function (item) {
                        item.checked = true;
                    });
                } else {
                    angular.forEach(items, function (item) {
                        item.checked = false;
                    });

                    for (var i = 0; i < (selectLimit - totalChecked) ; i++) {
                        items[i].checked = true;
                    }
                    scope.maxSelected = true;
                }
                setModelValue(true);
            };

            scope.uncheckAll = function () {
                var items = useFiltered ? getFilteredItems() : scope.items;
                angular.forEach(items, function (item) {
                    item.checked = false;
                });
                canCheck();
                if (isMultiple) {
                    setModelValue(true);
                }
            };

            scope.select = function (item) {
                if (isMultiple === false) {
                    selectSingle(item);
                    scope.toggleSelect();
                } else {
                    selectMultiple(item);
                }
            };

            scope.clearFilter = function () {
                scope.searchText.label = '';
            };
            }
        };
    }

    MultiselectPopup.$inject = [ '$document' ];
    function MultiselectPopup ($document) {
        return {
            restrict: 'E',
            replace: true,
            require: ['^ngModel', '?^form'],
            templateUrl: 'template/multiselect/multiselectPopup.html',
            link: function (scope, element) {
                var $dropdown = element.find('.dropdown-menu');
                $dropdown.attr("id", scope.popupId);

                if (scope.appendToBody) {
                    $document.find('body').append($dropdown);
                }

                var
                    clickHandler = function (event) {
                        if (elementMatchesAnyInArray(event.target, element.find(event.target.tagName)))
                            {return;}

                        if (scope.appendToBody) {
                            if (elementMatchesAnyInArray(event.target, $dropdown.find(event.target.tagName)))
                                {return;}
                        }

                        element.removeClass('open');
                        scope.isOpen = false;
                        $document.unbind('click', clickHandler);
                        scope.$apply();
                    },
                    elementMatchesAnyInArray = function (element, elementArray) {
                        for (var i = 0; i < elementArray.length; i++) {
                            if (element === elementArray[i]) {
                                return true;
                            }
                        }
                        return false;
                    };

                scope.clickHandler = clickHandler;
                scope.isVisible = false;
                scope.isHeightChanged = true;

                var
                    dropdownHeight,
                    dropdownWidth;

                scope.toggleSelect = function () {
                    if (element.hasClass('open') || scope.isOpen) {
                        element.removeClass('open');
                        scope.isOpen = false;
                        $document.unbind('click', clickHandler);
                    } else {
                        element.addClass('open');
                        scope.isOpen = true;
                        $document.bind('click', clickHandler);
                        if (scope.isAutoFocus) {
                            scope.focus();
                        }
                        scope.recalculatePosition();
                    }
                    var parent = element.parent();
                    var windowScrollTop = $(window).scrollTop();
                    var windowHeight = $(window).height();
                    var windowWidth = $(window).width();
                    var ulElement = element.find("ul:first");

                    if (scope.isHeightChanged) {
                        dropdownHeight = ulElement.height();
                        dropdownWidth = ulElement.width();
                        scope.isHeightChanged = false;
                    }

                    if (dropdownHeight <= 0 && dropdownWidth <= 0) {
                        var clonedElement = $(ulElement)
                            .clone()
                            .css('position', 'fixed')
                            .css('top', '0')
                            .css('left', '-10000px')
                            .appendTo(parent)
                            .removeClass('ng-hide')
                            .show();

                        dropdownHeight = clonedElement.height();
                        dropdownWidth = clonedElement.width();

                        clonedElement.remove();
                        clonedElement = null;
                    }
                    var elementTop = element.offset().top + element.height() - windowScrollTop;
                    var elementBottom = windowHeight - element.height() - element.offset().top + windowScrollTop;
                    if ((elementBottom < dropdownHeight) && (elementTop > dropdownHeight)) {
                        scope.dropup = true;
                    }
                    else {
                        scope.dropup = false;
                    }

                    if (element.offset().left + dropdownWidth >= windowWidth) {
                        scope.isOffRight = true;
                        var adjust = ((element.offset().left + dropdownWidth - windowWidth) + 10) * -1.0;
                        ulElement.css("left", adjust.toString() + "px");
                    }
                    else {
                        scope.isOffRight = false;
                        ulElement.css("left", "0");
                    }
                };

                scope.focus = function focus() {
                    if (scope.enableFilter) {
                        var searchBox = element.find('input')[0];
                        searchBox.focus();
                    }
                };
            }
        };
    }

    // IE11 doesn't enable the filter box when parent changes is using disabled attribute
    // so, use ng-disabled in your own HTML!
    multiselectTemplate.$inject = [ "$templateCache" ];
    function multiselectTemplate ($templateCache) {
            $templateCache.put("template/multiselect/multiselectPopup.html",
                "<div class=\"btn-group\" ng-class=\"{ dropup: dropup, single: !multiple }\">" +
                    "<button type=\"button\" class=\"btn btn-default dropdown-toggle\" ng-click=\"toggleSelect()\" ng-disabled=\"disabled\" ng-class=\"{'has-error': !valid()}\">" +
                        "<span class=\"pill pull-left\" ng-repeat=\"pill in header track by $index\">{{ pill }}"+
                        "<span class=\"\" ng-if=\"$index != 0 || $index != header.length - 1\">,&nbsp;</span>" +
                        "</span>" +
                        "<span class=\"caret pull-right\"></span>" +
                    "</button>" +
                    "<ul class=\"dropdown-menu multi-select-popup\" ng-show=\"isOpen && !moveInProgress\" ng-style=\"{ true: {top: position.top +'px', left: position.left +'px'}, false: {}}[appendToBody]\" style=\"display: block;\" role=\"listbox\" aria-hidden=\"{{!isOpen}}\">" +
                        "<li ng-if=\"enableFilter\" class=\"filter-container\">" +
                            "<div class=\"form-group has-feedback filter\">" +
                                "<input class=\"form-control\" type=\"text\" ng-model=\"searchText.label\" placeholder=\"{{ filterPlaceholder }}\" />" +
                                "<span class=\"glyphicon glyphicon-remove-circle form-control-feedback\" ng-click=\"clearFilter()\"></span>" +
                            "</div>" +
                        "</li>" +
                        "<li ng-show=\"multiple && (enableCheckAll || enableUncheckAll)\">" +
                            "<button ng-if=\"enableCheckAll\" type=\"button\" class=\"btn-link btn-small\" ng-click=\"checkAll()\"><i class=\"icon-ok\"></i> {{ checkAllLabel }}</button>" +
                            "<button ng-if=\"enableUncheckAll\" type=\"button\" class=\"btn-link btn-small\" ng-click=\"uncheckAll()\"><i class=\"icon-remove\"></i> {{ uncheckAllLabel }}</button>" +
                        "</li>" +
                        "<li ng-show=\"maxSelected\">" +
                            "<small>Selected maximum of </small><small ng-bind=\"selectLimit\"></small>" +
                        "</li>" +
                        "<li ng-repeat=\"i in items | filter:searchText\">" +
                            "<a ng-click=\"select(i);\">" +
                                "<i class=\"glyphicon\" ng-class=\"{'glyphicon-ok': i.checked, 'glyphicon-none': !i.checked}\"></i>" +
                                "<span ng-bind=\"i.label\"></span>" +
                            "</a>" +
                        "</li>" +
                    "</ul>" +
                "</div>");
    }


    angular.module('uix-multiselect.services', []);
    angular.module('uix-multiselect.controllers', []);
    angular.module('uix-multiselect.directives', []);
    angular.module('uix-multiselect.constants', []);
    angular.module('uix-multiselect',
        [
            'uix-multiselect.services',
            'uix-multiselect.controllers',
            'uix-multiselect.directives',
            'uix-multiselect.constants'
        ]);

    angular
        .module('uix-multiselect.services')
        .factory('multiselectParser', MultiselectParser);

    angular
        .module('uix-multiselect.directives')
        .directive('multiselectPopup', MultiselectPopup)
        .directive('multiselect', Multiselect);

    angular
        .module('uix-multiselect')
        .run(multiselectTemplate);


})();
